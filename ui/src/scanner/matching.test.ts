import { describe, expect, it } from "vitest";

import { normalizeTitle, similarity, matchScore } from "./matching";

describe("normalizeTitle", () => {
  it("ignores case, accents, punctuation and leading articles", () => {
    expect(normalizeTitle("The Perks of Being a Wallflower!")).toBe("perks of being a wallflower");
    expect(normalizeTitle("  Les Misérables ")).toBe("les miserables");
    expect(normalizeTitle("A Tale of Two Cities")).toBe("tale of two cities");
  });
});

describe("similarity", () => {
  it("is 1 for the same words in any order and 0 for nothing in common", () => {
    expect(similarity("Brave New World", "brave new world")).toBe(1);
    expect(similarity("World, Brave New", "Brave New World")).toBe(1);
    expect(similarity("Dune", "Emma")).toBe(0);
  });

  it("tolerates OCR slips and subtitles", () => {
    expect(similarity("Frankenstien", "Frankenstein")).toBeGreaterThan(0.6);
    expect(similarity("Frankenstein", "Frankenstein; or, The Modern Prometheus")).toBeGreaterThan(0.5);
  });
});

describe("matchScore", () => {
  it("weights the title most, and uses the author when we have one", () => {
    const candidate = { title: "Frankenstein", authors: ["Mary Shelley"] };
    expect(matchScore({ title: "Frankenstein", author: "Mary Shelley" }, candidate)).toBeCloseTo(1);
    expect(matchScore({ title: "Frankenstein", author: null }, candidate)).toBeCloseTo(1);
    const wrongAuthor = matchScore({ title: "Frankenstein", author: "Dean Koontz" }, candidate);
    expect(wrongAuthor).toBeLessThan(0.8);
    expect(wrongAuthor).toBeGreaterThan(0.5);
  });

  it("prefers the book itself over adaptations, summaries and study guides", () => {
    const read = { title: "1984", author: "George Orwell" };
    const original = matchScore(read, { title: "1984", authors: ["George Orwell"] });
    const adaptation = matchScore(read, { title: "1984 (adaptation)", authors: ["Michael Dean", "George Orwell"] });
    const guide = matchScore(read, { title: "1984: A Study Guide", authors: ["George Orwell"] });
    expect(original).toBeGreaterThan(adaptation);
    expect(original).toBeGreaterThan(guide);
    expect(adaptation).toBeLessThan(0.75);
    // Unless that's what the photo says.
    expect(matchScore({ title: "1984 graphic novel", author: null }, { title: "1984: The Graphic Novel", authors: [] })).toBeGreaterThan(0.75);
  });

  it("reads numbers and number words as the same title", () => {
    expect(similarity("1984", "Nineteen Eighty-Four")).toBe(1);
    expect(similarity("Catch-22", "Catch-Twenty-Two")).toBe(1);
    expect(similarity("2001: A Space Odyssey", "Two Thousand One: A Space Odyssey")).toBeGreaterThan(0.9);
  });

  it("prefers the widely published work when titles tie", () => {
    const read = { title: "1984", author: "George Orwell" };
    const novel = matchScore(read, { title: "Nineteen Eighty-Four", authors: ["George Orwell"], editions: 727 });
    const graphicNovel = matchScore(read, { title: "1984", authors: ["Xavier Coste", "George Orwell"], editions: 3 });
    expect(novel).toBeGreaterThan(graphicNovel);
  });

  it("slightly prefers an exact title over one with a subtitle", () => {
    const read = { title: "Persepolis", author: "Marjane Satrapi" };
    expect(matchScore(read, { title: "Persepolis", authors: ["Marjane Satrapi"] })).toBeGreaterThan(
      matchScore(read, { title: "Persepolis 1", authors: ["Marjane Satrapi"] }),
    );
  });
});
