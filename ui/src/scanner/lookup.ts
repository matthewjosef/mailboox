// Find catalogue entries for what the scanner read: Open Library first, then Google Books.
import { matchScore } from "./matching";
import type { Detection } from "./recognition";

export interface Candidate {
  title: string;
  authors: string[];
  isbn: string | null;
  openLibraryKey: string | null;
  coverUrl: string | null;
  year: number | null;
  /** How many editions the catalogue knows of; a hint for which work is "the" book. */
  editions?: number | null;
  source: "Open Library" | "Google Books";
}

export interface LookupResult {
  best: { candidate: Candidate; score: number } | null;
  /** All candidates, best first, so the person can pick a different edition. */
  candidates: Candidate[];
  error?: string;
}

/** Below this, a candidate is shown as an option but not assumed to be the book. */
export const MIN_MATCH_SCORE = 0.6;

type Fetch = (url: string) => Promise<Response>;

const OL_FIELDS = "key,title,author_name,isbn,cover_i,first_publish_year,edition_count";

async function openLibrarySearch(params: URLSearchParams, fetchFn: Fetch): Promise<Record<string, any>[]> {
  params.set("limit", "5");
  params.set("fields", OL_FIELDS);
  const res = await fetchFn(`https://openlibrary.org/search.json?${params}`);
  if (!res.ok) return [];
  return ((await res.json()) as { docs?: Record<string, any>[] }).docs ?? [];
}

/**
 * A title search plus a general search: the general one finds works catalogued under another
 * form of the title ("Nineteen Eighty-Four" for a spine reading "1984").
 */
async function openLibrary(title: string, author: string | null, fetchFn: Fetch): Promise<Candidate[]> {
  const byTitle = new URLSearchParams({ title });
  if (author) byTitle.set("author", author);
  const general = new URLSearchParams({ q: author ? `${title} ${author}` : title });
  const docs = [...(await openLibrarySearch(byTitle, fetchFn)), ...(await openLibrarySearch(general, fetchFn))];
  const seen = new Set<string>();
  const unique = docs.filter((d) => !d.key || (!seen.has(d.key) && seen.add(d.key)));
  return unique.map((d) => ({
    title: d.title,
    authors: d.author_name ?? [],
    isbn: d.isbn?.find((i: string) => i.length === 13) ?? d.isbn?.[0] ?? null,
    openLibraryKey: d.key ?? null,
    coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
    year: d.first_publish_year ?? null,
    editions: d.edition_count ?? null,
    source: "Open Library" as const,
  }));
}

async function googleBooks(title: string, author: string | null, fetchFn: Fetch): Promise<Candidate[]> {
  const q = `intitle:${title}${author ? ` inauthor:${author}` : ""}`;
  const res = await fetchFn(`https://www.googleapis.com/books/v1/volumes?${new URLSearchParams({ q, maxResults: "5" })}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: { volumeInfo: Record<string, any> }[] };
  return (data.items ?? []).map(({ volumeInfo: v }) => {
    const ids: { type: string; identifier: string }[] = v.industryIdentifiers ?? [];
    const year = parseInt(String(v.publishedDate ?? "").slice(0, 4), 10);
    return {
      title: v.subtitle ? `${v.title}: ${v.subtitle}` : v.title,
      authors: v.authors ?? [],
      isbn: (ids.find((i) => i.type === "ISBN_13") ?? ids.find((i) => i.type === "ISBN_10"))?.identifier ?? null,
      openLibraryKey: null,
      coverUrl: v.imageLinks?.thumbnail?.replace(/^http:/, "https:") ?? null,
      year: Number.isFinite(year) ? year : null,
      source: "Google Books" as const,
    };
  });
}

export async function findMatches(read: Detection, fetchFn: Fetch = (u) => fetch(u)): Promise<LookupResult> {
  let candidates: Candidate[];
  try {
    candidates = await openLibrary(read.title, read.author, fetchFn);
    if (!candidates.length && read.author) candidates = await openLibrary(read.title, null, fetchFn);
    if (!candidates.length) candidates = await googleBooks(read.title, read.author, fetchFn);
  } catch {
    return { best: null, candidates: [], error: "Couldn't reach the book catalogues" };
  }
  const scored = candidates
    .map((candidate) => ({ candidate, score: matchScore(read, candidate) }))
    .sort((a, b) => b.score - a.score);
  const top = scored[0];
  return {
    best: top && top.score >= MIN_MATCH_SCORE ? top : null,
    candidates: scored.map((s) => s.candidate),
  };
}
