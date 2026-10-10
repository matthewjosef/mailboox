// Fuzzy title/author matching, tolerant of OCR slips, word order and subtitles.

const ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(" ");
const TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split(" ");

function below100(n: number): string {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}

/** Spell numbers the way titles do: 1984 → "nineteen eighty four", 2001 → "two thousand one", 22 → "twenty two". */
function numberWords(digits: string): string {
  const n = Number(digits);
  if (digits.length === 4 && n >= 2000 && n < 2010) return `two thousand${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
  if (digits.length === 4 && n >= 1100) {
    const [hi, lo] = [Math.floor(n / 100), n % 100];
    return `${below100(hi)} ${lo === 0 ? "hundred" : lo < 10 ? `oh ${ONES[lo]}` : below100(lo)}`;
  }
  return n < 100 ? below100(n) : digits;
}

export function normalizeTitle(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\d+/g, (d) => ` ${numberWords(d)} `)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(the|a|an) /, "");
}

function bigrams(s: string): string[] {
  const t = s.replace(/ /g, "");
  return Array.from({ length: Math.max(t.length - 1, 0) }, (_, i) => t.slice(i, i + 2));
}

function dice<T>(a: T[], b: T[]): number {
  if (!a.length || !b.length) return 0;
  const counts = new Map<T, number>();
  for (const x of a) counts.set(x, (counts.get(x) ?? 0) + 1);
  let shared = 0;
  for (const x of b) {
    const n = counts.get(x) ?? 0;
    if (n > 0) {
      shared++;
      counts.set(x, n - 1);
    }
  }
  return (2 * shared) / (a.length + b.length);
}

/** The main title, without a subtitle after ":", ";" or "(". */
function mainTitle(s: string): string {
  return s.split(/[:;(]/)[0];
}

function compare(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const tokens = dice([...new Set(na.split(" "))], [...new Set(nb.split(" "))]);
  const chars = dice(bigrams([...na.split(" ")].sort().join(" ")), bigrams([...nb.split(" ")].sort().join(" ")));
  return Math.max(tokens, chars);
}

/** 0–1: how alike two titles (or names) are. Also compares main titles without subtitles. */
export function similarity(a: string, b: string): number {
  let best = 0;
  for (const x of new Set([a, mainTitle(a)])) {
    for (const y of new Set([b, mainTitle(b)])) best = Math.max(best, compare(x, y));
  }
  return best;
}

/** Catalogue entries that are about a book rather than the book itself. */
const DERIVATIVE =
  /\b(adaptation|adapted|summary|summaries|study guide|guide to|sparknotes|cliffsnotes|analysis|workbook|companion|graphic novel|abridged|retold|unabridged audio|audiobook)\b/i;

/** 0–1: how well a catalogue entry fits what the scanner read. */
export function matchScore(
  read: { title: string; author: string | null },
  candidate: { title: string; authors: string[]; editions?: number | null },
): number {
  // Widely published works win ties (the novel over a 3-edition graphic novel of it).
  const popularity = Math.min(0.04, Math.log10((candidate.editions ?? 0) + 1) * 0.015);
  return Math.min(1, baseScore(read, candidate) + popularity);
}

function baseScore(read: { title: string; author: string | null }, candidate: { title: string; authors: string[] }): number {
  let title = similarity(read.title, candidate.title);
  // An exact title beats one with a subtitle or volume number ("Persepolis" vs "Persepolis 1").
  if (normalizeTitle(read.title) !== normalizeTitle(candidate.title)) title *= 0.97;
  // Adaptations, summaries and guides share the title but aren't the book, unless the photo says so.
  if (DERIVATIVE.test(candidate.title) && !DERIVATIVE.test(read.title)) title *= 0.6;
  if (!read.author || candidate.authors.length === 0) return title;
  // The first listed author is the main one; later ones are often illustrators or adapters.
  const author = Math.max(...candidate.authors.map((a, i) => similarity(read.author!, a) * (i === 0 ? 1 : 0.7)));
  return 0.75 * title + 0.25 * author;
}
