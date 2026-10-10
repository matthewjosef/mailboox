// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { acceptAll, booksToAdd, buildSuggestions } from "../scanner/review";
import { toPlain } from "./libraryClient";
import { emptyBook } from "./types";

// Uses real Svelte 5 $state (this file is compiled with runes), not an imitation proxy.
describe("toPlain with real Svelte state", () => {
  it("turns the scanner's reactive suggestions into data postMessage can clone", () => {
    const candidate = {
      title: "Tribe of Mentors",
      authors: ["Timothy Ferriss"],
      isbn: "9781713553625",
      openLibraryKey: "/works/OL1W",
      coverUrl: "https://covers.openlibrary.org/b/id/1-M.jpg",
      year: 2017,
      editions: 12,
      source: "Open Library" as const,
    };
    let suggestions = $state(
      buildSuggestions(
        [
          {
            detection: { title: "TRIBE OF MENTORS", author: "TIMOTHY FERRISS", confidence: 1 },
            lookup: { best: { candidate, score: 1 }, candidates: [candidate] },
          },
        ],
        [],
      ),
    );
    const books = booksToAdd(acceptAll(suggestions));
    expect(() => structuredClone(books)).toThrow(); // what Moss's postMessage hit in 0.1.1
    const plain = toPlain(books);
    expect(() => structuredClone(plain)).not.toThrow();
    expect(plain).toEqual([
      {
        ...emptyBook("Scan"),
        title: "Tribe of Mentors",
        authors: ["Timothy Ferriss"],
        isbn: "9781713553625",
        open_library_key: "/works/OL1W",
        cover_url: "https://covers.openlibrary.org/b/id/1-M.jpg",
      },
    ]);
  });
});
