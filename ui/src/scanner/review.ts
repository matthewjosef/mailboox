// The review step: which suggested books to add, as plain data so it's easy to test.
import type { Book } from "../library/types";
import type { Candidate, LookupResult } from "./lookup";
import { similarity } from "./matching";
import type { Detection } from "./recognition";

export interface ScanResult {
  detection: Detection;
  lookup: LookupResult;
}

export type Decision = "add" | "skip" | "undecided";
/** Why a suggestion starts where it does. */
export type Reason = "matched" | "unsure" | "duplicate" | "repeat";

export interface Suggestion {
  id: string;
  detection: Detection;
  lookup: LookupResult;
  /** What will be added, editable. */
  book: Book;
  decision: Decision;
  reason: Reason;
  edited: boolean;
  /** For undo: the decision before the latest change, and when that change happened. */
  previous: Decision;
  changedAt: number;
}

/** Catalogue matches at least this good start as "Add". */
export const CONFIDENT_MATCH = 0.75;

export function bookFromCandidate(c: Candidate): Book {
  return {
    title: c.title,
    authors: c.authors,
    isbn: c.isbn,
    open_library_key: c.openLibraryKey,
    cover_url: c.coverUrl,
    genre: null,
    blurb: null,
    source: "Scan",
  };
}

function bookFromDetection(d: Detection): Book {
  return {
    title: d.title,
    authors: d.author ? [d.author] : [],
    isbn: null,
    open_library_key: null,
    cover_url: null,
    genre: null,
    blurb: null,
    source: "Scan",
  };
}

export function isSameBook(a: Book, b: Book): boolean {
  if (a.isbn && b.isbn && a.isbn === b.isbn) return true;
  if (a.open_library_key && b.open_library_key && a.open_library_key === b.open_library_key) return true;
  if (similarity(a.title, b.title) < 0.9) return false;
  if (!a.authors.length || !b.authors.length) return true;
  return a.authors.some((x) => b.authors.some((y) => similarity(x, y) >= 0.6));
}

export function buildSuggestions(results: ScanResult[], myBooks: Book[]): Suggestion[] {
  const suggestions: Suggestion[] = [];
  results.forEach(({ detection, lookup }, i) => {
    const book = lookup.best ? bookFromCandidate(lookup.best.candidate) : bookFromDetection(detection);
    let decision: Decision = "undecided";
    let reason: Reason = "unsure";
    if (myBooks.some((mine) => isSameBook(book, mine))) {
      decision = "skip";
      reason = "duplicate";
    } else if (suggestions.some((s) => isSameBook(book, s.book))) {
      decision = "skip";
      reason = "repeat";
    } else if (lookup.best && lookup.best.score >= CONFIDENT_MATCH) {
      decision = "add";
      reason = "matched";
    }
    suggestions.push({ id: `s${i}`, detection, lookup, book, decision, reason, edited: false, previous: decision, changedAt: 0 });
  });
  return suggestions;
}

const setAside = (s: Suggestion) => s.reason === "duplicate" || s.reason === "repeat";

function change(list: Suggestion[], id: string, patch: (s: Suggestion) => Partial<Suggestion>): Suggestion[] {
  const now = Math.max(0, ...list.map((s) => s.changedAt)) + 1;
  return list.map((s) => (s.id === id ? { ...s, previous: s.decision, changedAt: now, ...patch(s) } : s));
}

export function decide(list: Suggestion[], id: string, decision: Decision): Suggestion[] {
  return change(list, id, () => ({ decision }));
}

/** Revert the most recent decision. */
export function undoLast(list: Suggestion[]): Suggestion[] {
  const latest = list.reduce<Suggestion | null>((a, s) => (s.changedAt > (a?.changedAt ?? 0) ? s : a), null);
  if (!latest) return list;
  return list.map((s) => (s.id === latest.id ? { ...s, decision: s.previous, changedAt: 0 } : s));
}

export function editBook(list: Suggestion[], id: string, book: Book): Suggestion[] {
  return change(list, id, () => ({ book: { ...book, source: "Scan" }, edited: true, decision: "add" }));
}

/** Use a different catalogue entry (e.g. another edition) for this suggestion. */
export function useCandidate(list: Suggestion[], id: string, candidate: Candidate): Suggestion[] {
  return change(list, id, () => ({ book: bookFromCandidate(candidate), decision: "add" }));
}

/** "Add all": everything not already on the shelf or explicitly skipped. */
export function acceptAll(list: Suggestion[]): Suggestion[] {
  return list.map((s) => (s.decision === "undecided" && !setAside(s) ? { ...s, decision: "add" } : s));
}

export function booksToAdd(list: Suggestion[]): Book[] {
  return list.filter((s) => s.decision === "add").map((s) => s.book);
}

/** One-at-a-time order: everything except duplicates, starting after `afterId`. */
export function nextToReview(list: Suggestion[], afterId: string | null): Suggestion | null {
  const queue = list.filter((s) => !setAside(s));
  const start = afterId ? queue.findIndex((s) => s.id === afterId) + 1 : 0;
  return queue[start] ?? null;
}

export function reviewQueue(list: Suggestion[]): Suggestion[] {
  return list.filter((s) => !setAside(s));
}

export function counts(list: Suggestion[]) {
  return {
    add: list.filter((s) => s.decision === "add").length,
    skip: list.filter((s) => s.decision === "skip").length,
    undecided: list.filter((s) => s.decision === "undecided").length,
    duplicates: list.filter(setAside).length,
    total: list.length,
  };
}
