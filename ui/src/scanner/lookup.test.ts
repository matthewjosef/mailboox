import { describe, expect, it, vi } from "vitest";

import { findMatches } from "./lookup";

const openLibraryHit = {
  numFound: 2,
  docs: [
    {
      key: "/works/OL450063W",
      title: "Frankenstein; or, The Modern Prometheus",
      author_name: ["Mary Shelley"],
      isbn: ["0486282112", "9780486282114"],
      cover_i: 12818862,
      first_publish_year: 1818,
    },
    { key: "/works/OL1W", title: "Frankenstein Lives Again", author_name: ["Someone Else"] },
  ],
};

function fakeFetch(routes: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    const hit = Object.entries(routes).find(([prefix]) => url.startsWith(prefix));
    if (!hit) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify(hit[1]), { status: 200 });
  });
}

describe("findMatches", () => {
  it("returns Open Library candidates, best first, with ISBN-13, key and cover", async () => {
    const fetch = fakeFetch({ "https://openlibrary.org/search.json": openLibraryHit });
    const result = await findMatches({ title: "Frankenstein", author: "Mary Shelley", confidence: 0.9 }, fetch);
    expect(result.best?.candidate).toMatchObject({
      title: "Frankenstein; or, The Modern Prometheus",
      authors: ["Mary Shelley"],
      isbn: "9780486282114",
      openLibraryKey: "/works/OL450063W",
      coverUrl: "https://covers.openlibrary.org/b/id/12818862-M.jpg",
      year: 1818,
      source: "Open Library",
    });
    expect(result.best!.score).toBeGreaterThan(0.6);
    expect(result.candidates).toHaveLength(2); // the general search returns the same docs; they're merged
    expect(fetch.mock.calls[0][0]).toContain("title=Frankenstein");
    expect(fetch.mock.calls[0][0]).toContain("author=Mary+Shelley");
  });

  it("falls back to Google Books when Open Library finds nothing", async () => {
    const fetch = fakeFetch({
      "https://openlibrary.org/search.json": { numFound: 0, docs: [] },
      "https://www.googleapis.com/books/v1/volumes": {
        items: [
          {
            volumeInfo: {
              title: "Persepolis",
              authors: ["Marjane Satrapi"],
              industryIdentifiers: [{ type: "ISBN_13", identifier: "9780375714573" }],
              imageLinks: { thumbnail: "http://books.google.com/x.jpg" },
              publishedDate: "2003-06-01",
            },
          },
        ],
      },
    });
    const result = await findMatches({ title: "Persepolis", author: null, confidence: 0.8 }, fetch);
    expect(result.best?.candidate).toMatchObject({
      title: "Persepolis",
      isbn: "9780375714573",
      coverUrl: "https://books.google.com/x.jpg",
      year: 2003,
      source: "Google Books",
    });
  });

  it("reports no match when nothing is close enough, and survives network errors", async () => {
    const fetch = fakeFetch({ "https://openlibrary.org/search.json": openLibraryHit });
    const none = await findMatches({ title: "Gardening for Beginners", author: null, confidence: 0.7 }, fetch);
    expect(none.best).toBeNull();

    const broken = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const offline = await findMatches({ title: "Emma", author: null, confidence: 0.9 }, broken);
    expect(offline).toEqual({ best: null, candidates: [], error: "Couldn't reach the book catalogues" });
  });
});
