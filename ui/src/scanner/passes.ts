// Reading a whole shelf in several passes: the full photo, then overlapping close-ups (more pixels
// per spine), then turned copies so sideways and leaning spines read as normal text. Pure logic;
// the caller renders each pass (canvas in the app, sips in the eval) and asks the model.
import { similarity } from "./matching";
import type { Detection } from "./recognition";

/** What the model says about how the books sit, from the first look at the whole photo. */
export interface Layout {
  /** Spines standing side by side; their text usually runs sideways. */
  upright: boolean;
  /** Books lying in a stack; spine text runs left to right. */
  flat: boolean;
  /** Books leaning at an angle. */
  leaning: boolean;
  /** How far leaning books tilt from vertical, positive when their tops lean right. */
  leanDegrees: number | null;
}

export const NO_LAYOUT: Layout = { upright: true, flat: false, leaning: false, leanDegrees: null };

/** Part of the photo (fractions of its width and height), turned clockwise by `rotate` degrees. */
export interface Pass {
  label: string;
  rect: { x: number; y: number; w: number; h: number };
  rotate: number;
}

export interface Strategy {
  /** Overlapping close-ups of the photo. */
  tiles: boolean;
  /** The whole photo turned a quarter, for upright spines. */
  quarterTurn: boolean;
  /** The whole photo turned to straighten leaning books (only when the model saw some). */
  straighten: boolean;
}

export const THOROUGH: Strategy = { tiles: true, quarterTurn: true, straighten: true };

const WHOLE = { x: 0, y: 0, w: 1, h: 1 };
export const FULL_PASS: Pass = { label: "the whole photo", rect: WHOLE, rotate: 0 };

/** Each close-up covers this share of the width and height, so neighbours overlap and no spine is only ever cut in half. */
const TILE = 0.55;
/** Below this many pixels on the long side, close-ups add no detail. */
const MIN_SIDE_FOR_TILES = 1400;
const DEFAULT_LEAN = 30;

function grid(width: number, height: number): [cols: number, rows: number] {
  const aspect = width / height;
  if (aspect >= 1.6) return [3, 2];
  if (aspect <= 1 / 1.6) return [2, 3];
  return [2, 2];
}

/** Spread `n` windows of size `size` evenly from 0 to 1. */
function starts(n: number, size: number): number[] {
  return Array.from({ length: n }, (_, i) => (n === 1 ? 0 : (i * (1 - size)) / (n - 1)));
}

/** The passes after the first full-photo look, chosen from the photo's size and what the model saw. */
export function planPasses(width: number, height: number, layout: Layout, strategy: Strategy = THOROUGH): Pass[] {
  const passes: Pass[] = [];
  if (strategy.tiles && Math.max(width, height) >= MIN_SIDE_FOR_TILES) {
    const [cols, rows] = grid(width, height);
    const xs = starts(cols, TILE);
    const ys = starts(rows, TILE);
    let n = 0;
    for (const y of ys)
      for (const x of xs) passes.push({ label: `close-up ${++n} of ${cols * rows}`, rect: { x, y, w: TILE, h: TILE }, rotate: 0 });
  }
  // English spines usually run top to bottom; a quarter turn anticlockwise lays them left to right.
  // Not gated on layout.upright: the model's layout answer isn't reliable enough to skip this.
  if (strategy.quarterTurn) passes.push({ label: "the photo turned sideways", rect: WHOLE, rotate: -90 });
  if (strategy.straighten && layout.leaning) {
    const lean = Math.min(60, Math.max(10, Math.abs(layout.leanDegrees ?? DEFAULT_LEAN)));
    // The model's sense of direction isn't reliable, so straighten both ways.
    passes.push({ label: "the photo turned left", rect: WHOLE, rotate: -lean });
    passes.push({ label: "the photo turned right", rect: WHOLE, rotate: lean });
  }
  return passes;
}

/** Two readings of one book. A near-identical title wins over a mismatched author: the first,
 *  whole-photo look sometimes pairs titles with their neighbours' authors. */
function sameReading(a: Detection, b: Detection): boolean {
  const titles = similarity(a.title, b.title);
  if (titles >= 0.9) return true;
  if (titles < 0.85) return false;
  if (!a.author || !b.author) return true;
  return similarity(a.author, b.author) >= 0.5;
}

/** Combine readings from every pass. A book read in more than one pass is more likely right. */
export function mergeDetections(lists: Detection[][]): Detection[] {
  const merged: { best: Detection; seen: number; author: string | null }[] = [];
  for (const list of lists) {
    for (const d of list) {
      const same = merged.find((m) => sameReading(m.best, d));
      if (!same) {
        merged.push({ best: d, seen: 1, author: d.author });
        continue;
      }
      same.seen++;
      same.author ??= d.author;
      if (d.confidence > same.best.confidence) same.best = d;
    }
  }
  return merged.map(({ best, seen, author }) => ({
    ...best,
    author: best.author ?? author,
    confidence: Math.min(1, best.confidence + 0.1 * (seen - 1)),
  }));
}

export interface ShelfReading {
  detections: Detection[];
  /** What the first look reported (null if it didn't say). */
  layout: Layout | null;
  passesRead: number;
  passesPlanned: number;
}

interface ReadShelfDeps {
  width: number;
  height: number;
  strategy?: Strategy;
  /** Render a pass as base64 JPEG. */
  render: (pass: Pass) => Promise<string>;
  /** Ask the model about one rendered pass. The layout matters only for the first look, FULL_PASS. */
  read: (imageBase64: string, pass: Pass, signal?: AbortSignal) => Promise<{ detections: Detection[]; layout: Layout | null }>;
  /** `of` is null until the first look has decided how many passes to make. */
  onProgress?: (part: number, of: number | null, label: string) => void;
  /** Cancels the whole scan. */
  signal?: AbortSignal;
  /** "Use what's read so far": stops after the current pass and keeps its results. */
  enough?: AbortSignal;
}

/** Read a shelf photo in several passes. A failing follow-up pass is skipped; the first one must work. */
export async function readShelf({ width, height, strategy, render, read, onProgress, signal, enough }: ReadShelfDeps): Promise<ShelfReading> {
  onProgress?.(1, null, FULL_PASS.label);
  const first = await read(await render(FULL_PASS), FULL_PASS, signal);
  const passes = planPasses(width, height, first.layout ?? NO_LAYOUT, strategy);
  const lists = [first.detections];
  let passesRead = 1;
  // Follow-up passes also stop, mid-pass, when the person has seen enough.
  const passSignal = enough && signal ? AbortSignal.any([signal, enough]) : (enough ?? signal);
  for (const [i, pass] of passes.entries()) {
    if (enough?.aborted) break;
    onProgress?.(i + 2, passes.length + 1, pass.label);
    try {
      lists.push((await read(await render(pass), pass, passSignal)).detections);
      passesRead++;
    } catch (e) {
      if (signal?.aborted) throw e;
      if (enough?.aborted) break;
      console.warn(`[MailBoox] skipped ${pass.label}:`, e);
    }
  }
  return { detections: mergeDetections(lists), layout: first.layout, passesRead, passesPlanned: passes.length + 1 };
}
