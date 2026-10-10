// Scanner accuracy check: runs the real recognizer over labelled photos and reports
// precision (how many readings were right) and recall (how many books were found).
//
//   npm run scanner:eval                       # samples + your photos
//   npm run scanner:eval -- scanner-eval/photos  # just one folder
//   MODEL=qwen2.5vl:3b npm run scanner:eval      # compare models
//   STRATEGY=single npm run scanner:eval          # shelves: one pass (as before 0.1.5)
//   STRATEGY=tiles,turn,straighten (the default)  # shelves: which follow-up passes to make
//   LOOKUP=1 npm run scanner:eval                 # also check each correct reading is found on Open Library
//   STRICT=1                                      # count repeat readings of a found book as wrong
//
// Labels: next to each photo `shelf1.jpg`, a `shelf1.txt` with one book per line. The order and
// separator are flexible ("Title — Author", "Title, Author", "Author, Title", "Author Title").
// Photos with "shelf" in the name, or more than one labelled book, are scanned as shelves (as in
// the app's "A shelf" mode); everything else as a single book. Passes are rendered with macOS sips.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";

import { findMatches } from "../ui/src/scanner/lookup";
import { normalizeTitle, similarity } from "../ui/src/scanner/matching";
import { read, recognize } from "../ui/src/scanner/ollama";
import { FULL_PASS, readShelf, type Pass, type Strategy } from "../ui/src/scanner/passes";
import type { Detection, ScanKind } from "../ui/src/scanner/recognition";

const MODEL = process.env.MODEL ?? "qwen2.5vl:7b";
const STRATEGY = (process.env.STRATEGY ?? "tiles,turn,straighten").split(",");
const SINGLE_PASS = STRATEGY.includes("single");
const strategy: Strategy = { tiles: STRATEGY.includes("tiles"), quarterTurn: STRATEGY.includes("turn"), straighten: STRATEGY.includes("straighten") };
const LOOKUP = !!process.env.LOOKUP;
const STRICT = !!process.env.STRICT;
const tmp = mkdtempSync(join(tmpdir(), "mailboox-eval-"));
process.on("exit", () => rmSync(tmp, { recursive: true, force: true }));

function sips(args: string[]): string {
  return execFileSync("sips", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

function pixelSize(path: string): { width: number; height: number } {
  const out = sips(["-g", "pixelWidth", "-g", "pixelHeight", path]);
  return { width: Number(/pixelWidth: (\d+)/.exec(out)![1]), height: Number(/pixelHeight: (\d+)/.exec(out)![1]) };
}

let renders = 0;
/** The same steps as the app: crop, turn (white corners), shrink (2048 px for shelves, 1280 for one book). */
function renderPass(path: string, size: { width: number; height: number }, pass: Pass, maxSide = 2048): string {
  const out = join(tmp, `pass${renders++}.jpg`);
  const args = ["-s", "format", "jpeg", "-s", "formatOptions", "88"];
  const [w, h] = [Math.round(pass.rect.w * size.width), Math.round(pass.rect.h * size.height)];
  if (w < size.width || h < size.height)
    args.push("-c", String(h), String(w), "--cropOffset", String(Math.round(pass.rect.y * size.height)), String(Math.round(pass.rect.x * size.width)));
  if (pass.rotate) args.push("-r", String((pass.rotate + 360) % 360), "--padColor", "FFFFFF");
  args.push("-Z", String(maxSide), path, "--out", out);
  sips(args);
  return readFileSync(out).toString("base64");
}

async function readPhoto(path: string, kind: ScanKind): Promise<{ found: Detection[]; passes: string }> {
  if (kind === "single" || SINGLE_PASS) {
    const image = renderPass(path, pixelSize(path), FULL_PASS, kind === "single" ? 1280 : 2048);
    return { found: await recognize(MODEL, image, kind), passes: "1 pass" };
  }
  const size = pixelSize(path);
  const reading = await readShelf({
    ...size,
    strategy,
    render: async (pass) => renderPass(path, size, pass),
    read: async (image, pass) => {
      const r = await read(MODEL, image, pass === FULL_PASS ? "shelf" : "part");
      if (process.env.DEBUG) console.log(`\n  [${pass.label}]`, r.detections.map((d) => `${d.title} / ${d.author}`).join(" | "));
      return r;
    },
    onProgress: (n, of, label) => process.stdout.write(`\r  ${basename(path)}: ${label} (${n}/${of ?? "?"})          `),
  });
  process.stdout.write("\r" + " ".repeat(80) + "\r");
  const l = reading.layout;
  const layout = l ? [l.upright && "upright", l.flat && "flat", l.leaning && `leaning ${l.leanDegrees ?? "?"}°`].filter(Boolean).join("+") : "no layout";
  return { found: reading.detections, passes: `${reading.passesRead} passes, ${layout}` };
}
const MATCH = 0.8;
/** Does a reading match a label line, whichever way round the line puts title and author? */
function matchesLabel(title: string, line: string): boolean {
  const parts = [line, ...line.split(/\s*[,—–]\s*|\s+-\s+/)].filter(Boolean);
  if (parts.some((p) => similarity(title, p) >= MATCH)) return true;
  const t = normalizeTitle(title);
  return t.length >= 6 && normalizeTitle(line).includes(t);
}

const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ["scanner-eval/samples", "scanner-eval/photos"];

let tp = 0;
let predicted = 0;
let expected = 0;
let seconds = 0;
let catalogued = 0;

for (const dir of dirs.filter(existsSync)) {
  for (const file of readdirSync(dir).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort()) {
    const labelFile = join(dir, basename(file, extname(file)) + ".txt");
    if (!existsSync(labelFile)) {
      console.log(`skip ${file}: no ${basename(labelFile)}`);
      continue;
    }
    const labels = readFileSync(labelFile, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const kind: ScanKind = /shelf/i.test(file) || labels.length > 1 ? "shelf" : "single";
    const started = Date.now();
    const { found, passes } = await readPhoto(join(dir, file), kind);
    const took = (Date.now() - started) / 1000;

    const unmatched = new Set(labels);
    let hits = 0;
    let repeats = 0;
    const misses: string[] = [];
    for (const d of found) {
      // A second reading of a book already found: the app sets these aside once both match the same catalogue entry.
      if (!STRICT && labels.some((l) => !unmatched.has(l) && matchesLabel(d.title, l))) {
        repeats++;
        continue;
      }
      const label = [...unmatched].find((l) => matchesLabel(d.title, l));
      if (label) {
        unmatched.delete(label);
        hits++;
        if (LOOKUP) {
          const { best } = await findMatches(d);
          if (best && best.score >= 0.75) catalogued++;
          else console.log(`  read but not matched on a catalogue: "${d.title}"${best ? ` (best: ${best.candidate.title}, ${best.score.toFixed(2)})` : ""}`);
        }
      } else misses.push(`${d.title}${d.author ? ` / ${d.author}` : ""} (${d.confidence})`);
    }
    tp += hits;
    predicted += found.length - repeats;
    expected += labels.length;
    seconds += took;
    console.log(
      `${file.padEnd(28)} ${kind.padEnd(6)} found ${hits}/${labels.length}${repeats ? ` (+${repeats} repeat readings)` : ""}` +
        `${misses.length ? `, wrong: ${misses.map((m) => `"${m}"`).join(", ")}` : ""}` +
        `${unmatched.size ? `, missed: ${[...unmatched].map((m) => `"${m}"`).join(", ")}` : ""}  (${passes}, ${took.toFixed(1)}s)`,
    );
  }
}

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "n/a");
console.log(
  `\n${MODEL}: precision ${pct(tp, predicted)} (${tp}/${predicted} readings right), ` +
    `recall ${pct(tp, expected)} (${tp}/${expected} books found), ${seconds.toFixed(0)}s total` +
    (LOOKUP ? `; ${catalogued}/${tp} correct readings matched confidently on a catalogue` : ""),
);
