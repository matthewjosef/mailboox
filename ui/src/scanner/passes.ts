// Reading a whole shelf in several passes: the full photo, then overlapping close-ups (more pixels
// per spine), then turned copies so sideways and leaning spines read as normal text. Pure logic;
// the caller renders each pass (canvas in the app, sips in the eval) and asks the model.
import { normalizeTitle, similarity } from "./matching";
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

/** The default. Close-ups are off: on a 32-book shelf they found nothing the sideways copy missed, added
 *  fragments ("IND", "CONNECT"), and took 400 of 600 seconds. */
export const THOROUGH: Strategy = { tiles: false, quarterTurn: true, straighten: true };

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

const samePerson = (a: string, b: string) => similarity(a, b) >= 0.85;
const contains = (longer: string, shorter: string) => ` ${normalizeTitle(longer)} `.includes(` ${normalizeTitle(shorter)} `);
/** "Traveling Mercies: Some Thoughts on Faith" is fuller than "Traveling Mercies". */
const fuller = (a: string, b: string) => normalizeTitle(a).length > normalizeTitle(b).length && contains(a, b);

/** The most-read author, preferring closer looks: the whole photo is where neighbours' authors get mixed up. */
function chooseAuthor(sightings: { name: string; closer: boolean }[]): string | null {
  const pool = sightings.some((s) => s.closer) ? sightings.filter((s) => s.closer) : sightings;
  let best: { name: string; votes: number } | null = null;
  for (const { name } of pool) {
    const votes = pool.filter((s) => similarity(s.name, name) >= 0.7).length;
    if (!best || votes > best.votes) best = { name, votes };
  }
  return best?.name ?? null;
}

/** Combine readings from every pass (the first list is the whole photo). A book read in more than one pass is more likely right. */
export function mergeDetections(lists: Detection[][]): Detection[] {
  const merged: { best: Detection; closer: boolean; title: string; seen: number; authors: { name: string; closer: boolean }[] }[] = [];
  lists.forEach((list, i) => {
    const closer = i > 0;
    for (const d of list) {
      const same = merged.find((m) => sameReading(m.best, d));
      const author = d.author ? [{ name: d.author, closer }] : [];
      if (!same) {
        merged.push({ best: d, closer, title: d.title, seen: 1, authors: author });
        continue;
      }
      same.seen++;
      same.authors.push(...author);
      const better = d.confidence > same.best.confidence || (d.confidence === same.best.confidence && closer && !same.closer);
      if (better) Object.assign(same, { best: d, closer, title: fuller(same.title, d.title) ? same.title : d.title });
      else if (fuller(d.title, same.title) && d.confidence >= same.best.confidence - 0.2) same.title = d.title;
    }
  });
  return tidy(
    merged.map((m) => ({ title: m.title, author: chooseAuthor(m.authors), confidence: Math.min(1, m.best.confidence + 0.1 * (m.seen - 1)) })),
  );
}

/** Drop the left-overs of misreading a shelf: scraps, cut-off titles, authors read as books, and mixed-up fields. */
function tidy(books: Detection[]): Detection[] {
  const others = (b: Detection) => books.filter((o) => o !== b);
  const namesBesides = (b: Detection) => others(b).flatMap((o) => (o.author ? [o.author] : []));
  // The author's name read as a book of its own.
  books = books.filter((b) => !((!b.author || samePerson(b.author, b.title)) && namesBesides(b).some((n) => samePerson(n, b.title))));
  books = books.map((b) => splitAuthor(b, namesBesides(b)));
  // An author that is another book's title ("Fool's Crow / Bhagavad Gita").
  books = books.map((b) => (b.author && others(b).some((o) => similarity(b.author!, o.title) >= 0.9) ? { ...b, author: null } : b));
  const compatible = (a: Detection, b: Detection) => !a.author || !b.author || similarity(a.author, b.author) >= 0.5;
  const kept: Detection[] = [];
  for (const b of books) {
    const words = normalizeTitle(b.title).split(" ");
    // A cut-off title ("CONNECT" of "How to Connect") belongs to the one full title it fits; if it fits several, it's a guess.
    const containers = books.filter((o) => o !== b && fuller(o.title, b.title) && compatible(o, b));
    if (containers.length && (words.length > 1 || words[0].length >= 5)) {
      const [whole] = containers;
      if (containers.length === 1 && !whole.author && b.author) Object.assign(whole, { author: b.author });
      continue;
    }
    // Scraps like "IND" or "et", unless an author says it's a real (short) title.
    if (!b.author && normalizeTitle(b.title).replace(/ /g, "").length < 4) continue;
    kept.push(b);
  }
  return kept;
}

/** "Thich Nhat Hanh Peace Begins Here": take off a known author's name from the start or end of a title. */
function splitAuthor(b: Detection, names: string[]): Detection {
  const words = b.title.split(/\s+/);
  for (const name of names) {
    const n = normalizeTitle(name);
    for (let k = 1; k < words.length; k++) {
      if (normalizeTitle(words.slice(0, k).join(" ")) === n) return { ...b, title: words.slice(k).join(" "), author: b.author ?? name };
      if (normalizeTitle(words.slice(-k).join(" ")) === n) return { ...b, title: words.slice(0, -k).join(" "), author: b.author ?? name };
    }
  }
  return b;
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
