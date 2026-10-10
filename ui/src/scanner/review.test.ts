import { describe, expect, it } from "vitest";

import { emptyBook, type Book } from "../library/types";
import type { Candidate } from "./lookup";
import {
  acceptAll,
  addMissed,
  booksToAdd,
  buildSuggestions,
  counts,
  decide,
  editBook,
  nextToReview,
  undoLast,
  useCandidate,
  type ScanResult,
} from "./review";

const frankenstein = {
  title: "Frankenstein",
  authors: ["Mary Shelley"],
  isbn: "9780486282114",
  openLibraryKey: "/works/OL450063W",
  coverUrl: "https://covers.openlibrary.org/b/id/1-M.jpg",
  year: 1818,
  source: "Open Library" as const,
};

const results: ScanResult[] = [
  {
    detection: { title: "Frankenstein", author: "Mary Shelley", confidence: 0.95 },
    lookup: { best: { candidate: frankenstein, score: 0.97 }, candidates: [frankenstein] },
  },
  {
    detection: { title: "Brve Nw Wrld", author: null, confidence: 0.4 },
    lookup: { best: null, candidates: [] },
  },
  {
    detection: { title: "1984", author: "George Orwell", confidence: 0.9 },
    lookup: { best: null, candidates: [] },
  },
];
const mine: Book[] = [{ ...emptyBook(), title: "Nineteen Eighty-Four", authors: ["George Orwell"], isbn: null }, { ...emptyBook(), title: "1984", authors: ["George Orwell"] }];

describe("buildSuggestions", () => {
  const s = buildSuggestions(results, mine);

  it("pre-selects confident matches, flags unclear ones, and sets aside books I already have", () => {
    expect(s.map((x) => [x.book.title, x.decision, x.reason])).toEqual([
      ["Frankenstein", "add", "matched"],
      ["Brve Nw Wrld", "undecided", "unsure"],
      ["1984", "skip", "duplicate"],
    ]);
  });

  it("fills the book from the catalogue match, falling back to what the scanner read", () => {
    expect(s[0].book).toMatchObject({
      title: "Frankenstein",
      authors: ["Mary Shelley"],
      isbn: "9780486282114",
      open_library_key: "/works/OL450063W",
      cover_url: "https://covers.openlibrary.org/b/id/1-M.jpg",
      source: "Scan",
    });
    expect(s[1].book).toMatchObject({ title: "Brve Nw Wrld", authors: [], source: "Scan" });
  });
});

describe("deciding", () => {
  it("adds and skips individually, with undo", () => {
    let s = buildSuggestions(results, mine);
    s = decide(s, s[1].id, "add");
    expect(counts(s)).toEqual({ add: 2, skip: 1, undecided: 0, duplicates: 1, total: 3 });
    s = undoLast(s);
    expect(s[1].decision).toBe("undecided");
  });

  it("'Add all' takes everything except duplicates, but respects explicit skips", () => {
    let s = buildSuggestions(results, mine);
    expect(booksToAdd(acceptAll(s)).map((b) => b.title)).toEqual(["Frankenstein", "Brve Nw Wrld"]);
    s = decide(s, s[0].id, "skip");
    expect(booksToAdd(acceptAll(s)).map((b) => b.title)).toEqual(["Brve Nw Wrld"]);
  });

  it("walks one at a time through everything that isn't a duplicate", () => {
    const s = buildSuggestions(results, mine);
    expect(nextToReview(s, null)?.book.title).toBe("Frankenstein");
    expect(nextToReview(s, s[0].id)?.book.title).toBe("Brve Nw Wrld");
    expect(nextToReview(s, s[1].id)).toBeNull();
  });
});

describe("editing", () => {
  it("lets me fix details, which marks the suggestion edited and to be added", () => {
    let s = buildSuggestions(results, mine);
    s = editBook(s, s[1].id, { ...s[1].book, title: "Brave New World", authors: ["Aldous Huxley"] });
    expect(s[1]).toMatchObject({ edited: true, decision: "add", book: { title: "Brave New World" } });
  });

  it("lets me choose a different catalogue match", () => {
    const other = { ...frankenstein, title: "Frankenstein (Penguin Classics)", isbn: "9780141439471" };
    let s = buildSuggestions([{ ...results[0], lookup: { ...results[0].lookup, candidates: [frankenstein, other] } }], []);
    s = useCandidate(s, s[0].id, other);
    expect(s[0].book).toMatchObject({ title: "Frankenstein (Penguin Classics)", isbn: "9780141439471" });
  });
});

describe("addMissed", () => {
  const typed = (title: string, best: Candidate | null = null) => ({
    detection: { title, author: null, confidence: 1 },
    lookup: { best: best ? { candidate: best, score: 0.5 } : null, candidates: best ? [best] : [] },
  });

  it("adds a typed-in book straight to the Add pile, even if the catalogue match is weak", () => {
    const list = addMissed([], typed("A Book Nobody Catalogued"), []);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ decision: "add", book: { title: "A Book Nobody Catalogued" } });
  });

  it("sets it aside when it's already on the shelf or already in the list", () => {
    const onShelf = addMissed([], typed("Emma"), [{ ...emptyBook(), title: "Emma" }]);
    expect(onShelf[0]).toMatchObject({ decision: "skip", reason: "duplicate" });
    const twice = addMissed(addMissed([], typed("Dune"), []), typed("Dune"), []);
    expect(twice[1]).toMatchObject({ decision: "skip", reason: "repeat" });
    expect(new Set(twice.map((s) => s.id)).size).toBe(2);
  });
});
