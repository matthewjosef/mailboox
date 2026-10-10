// Scanner accuracy check: runs the real recognizer over labelled photos and reports
// precision (how many readings were right) and recall (how many books were found).
//
//   npm run scanner:eval                       # samples + your photos
//   npm run scanner:eval -- scanner-eval/photos  # just one folder
//   MODEL=qwen2.5vl:3b npm run scanner:eval      # compare models
//
// Labels: next to each photo `shelf1.jpg`, a `shelf1.txt` with one `Title — Author` per line.
// Photos named `shelf*` are scanned as shelves; everything else as a single book.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { basename, extname, join } from "node:path";

import { similarity } from "../ui/src/scanner/matching";
import { recognize } from "../ui/src/scanner/ollama";
import type { ScanKind } from "../ui/src/scanner/recognition";

const MODEL = process.env.MODEL ?? "qwen2.5vl:7b";
const MATCH = 0.8;
const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ["scanner-eval/samples", "scanner-eval/photos"];

let tp = 0;
let predicted = 0;
let expected = 0;
let seconds = 0;

for (const dir of dirs.filter(existsSync)) {
  for (const file of readdirSync(dir).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort()) {
    const labelFile = join(dir, basename(file, extname(file)) + ".txt");
    if (!existsSync(labelFile)) {
      console.log(`skip ${file}: no ${basename(labelFile)}`);
      continue;
    }
    const labels = readFileSync(labelFile, "utf8")
      .split("\n")
      .map((l) => l.split(/\s+[—–-]\s+/)[0].trim())
      .filter(Boolean);
    const kind: ScanKind = /^shelf/i.test(file) ? "shelf" : "single";
    const started = Date.now();
    const found = await recognize(MODEL, readFileSync(join(dir, file)).toString("base64"), kind);
    const took = (Date.now() - started) / 1000;

    const unmatched = new Set(labels);
    let hits = 0;
    const misses: string[] = [];
    for (const d of found) {
      const label = [...unmatched].find((l) => similarity(d.title, l) >= MATCH);
      if (label) {
        unmatched.delete(label);
        hits++;
      } else misses.push(d.title);
    }
    tp += hits;
    predicted += found.length;
    expected += labels.length;
    seconds += took;
    console.log(
      `${file.padEnd(28)} ${kind.padEnd(6)} found ${hits}/${labels.length}` +
        `${misses.length ? `, wrong: ${misses.map((m) => `"${m}"`).join(", ")}` : ""}` +
        `${unmatched.size ? `, missed: ${[...unmatched].map((m) => `"${m}"`).join(", ")}` : ""}  (${took.toFixed(1)}s)`,
    );
  }
}

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "n/a");
console.log(
  `\n${MODEL}: precision ${pct(tp, predicted)} (${tp}/${predicted} readings right), ` +
    `recall ${pct(tp, expected)} (${tp}/${expected} books found), ${seconds.toFixed(0)}s total`,
);
