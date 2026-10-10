import { describe, expect, it, vi } from "vitest";

import { mergeDetections, NO_LAYOUT, planPasses, readShelf, THOROUGH, type Layout } from "./passes";
import type { Detection } from "./recognition";

const d = (title: string, author: string | null = null, confidence = 0.8): Detection => ({ title, author, confidence });

const withTiles = { ...THOROUGH, tiles: true };

describe("planPasses", () => {
  it("by default turns the photo sideways for upright spines, without close-ups", () => {
    // On a 32-book shelf, close-ups found nothing new, added fragments ("IND", "CONNECT") and took 400 of 600 seconds.
    expect(planPasses(4032, 3024, NO_LAYOUT).map((p) => p.label)).toEqual(["the photo turned sideways"]);
  });

  it("can add overlapping close-ups covering a big photo", () => {
    const passes = planPasses(4032, 3024, NO_LAYOUT, withTiles);
    const tiles = passes.filter((p) => p.label.startsWith("close-up"));
    expect(tiles).toHaveLength(4);
    // Corners covered, neighbours overlap.
    expect(tiles[0].rect).toMatchObject({ x: 0, y: 0 });
    expect(tiles[3].rect.x + tiles[3].rect.w).toBeCloseTo(1);
    expect(tiles[1].rect.x).toBeLessThan(tiles[0].rect.w);
    expect(passes.find((p) => p.rotate === -90)).toBeDefined();
  });

  it("uses a wider grid for a long, low shelf and none for a small photo", () => {
    expect(planPasses(4000, 1500, NO_LAYOUT, withTiles).filter((p) => p.label.startsWith("close-up"))).toHaveLength(6);
    expect(planPasses(960, 644, NO_LAYOUT, withTiles).filter((p) => p.label.startsWith("close-up"))).toHaveLength(0);
  });

  it("straightens leaning books both ways, only when there are some", () => {
    const leaning: Layout = { upright: false, flat: true, leaning: true, leanDegrees: 25 };
    expect(planPasses(960, 644, leaning).map((p) => p.rotate)).toEqual([-90, -25, 25]);
    expect(planPasses(960, 644, { ...leaning, leanDegrees: null }).map((p) => p.rotate)).toEqual([-90, -30, 30]);
    expect(planPasses(960, 644, { ...leaning, leaning: false }).map((p) => p.rotate)).toEqual([-90]);
  });

  it("follows the chosen strategy", () => {
    expect(planPasses(4032, 3024, NO_LAYOUT, { tiles: false, quarterTurn: false, straighten: true })).toEqual([]);
  });
});

describe("mergeDetections", () => {
  it("keeps one entry per book across passes, the best reading, and more confidence when seen twice", () => {
    const merged = mergeDetections([
      [d("Tribe of Mentors", null, 0.7), d("Emma", "Jane Austen")],
      [d("TRIBE OF MENTORS", "Timothy Ferriss", 0.6), d("Dune", "Frank Herbert")],
    ]);
    expect(merged).toHaveLength(3);
    const tribe = merged.find((m) => m.title === "Tribe of Mentors")!;
    expect(tribe.author).toBe("Timothy Ferriss");
    expect(tribe.confidence).toBeCloseTo(0.8);
  });

  it("merges the same title even when one pass paired it with the wrong author", () => {
    expect(mergeDetections([[d("THE 4-HOUR WORKWEEK", "MARK MANSON")], [d("The 4-Hour Workweek", "Tim Ferriss")]])).toHaveLength(1);
  });

  it("keeps similar but different titles by different authors apart", () => {
    expect(mergeDetections([[d("The Hobbit", "J. R. R. Tolkien")], [d("The Habit", "Charles Duhigg")]])).toHaveLength(2);
  });

  // Real readings of a 32-book shelf. The first, whole-photo look paired several titles with the
  // next spine's author; the sideways copy, where spine text runs left to right, got them right.
  it("takes authors from the closer look when the whole photo paired titles with a neighbour's author", () => {
    const merged = mergeDetections([
      [d("THE ART OF GATHERING", "Anne Lamott", 1), d("ALL ABOUT LOVE", "Thich Nhat Hanh", 1), d("BIRD BY BIRD", "Anne Lamott", 1)],
      [d("Bird by Bird", "Anne Lamott", 1), d("The Art of Gathering", "Priya Parker", 1), d("All About Love", "bell hooks", 1)],
    ]);
    expect(merged.map((m) => `${m.title} / ${m.author}`)).toEqual([
      "The Art of Gathering / Priya Parker",
      "All About Love / bell hooks",
      "Bird by Bird / Anne Lamott",
    ]);
  });

  it("drops an author that is really another book's title", () => {
    const merged = mergeDetections([[d("FOOL'S CROW", "BHAGAVAD GITA", 1), d("Bhagavad Gita", "Swami Prabhavananda", 1)]]);
    expect(merged.find((m) => m.title === "FOOL'S CROW")!.author).toBeNull();
  });

  it("folds a cut-off title into the full one, and drops scraps", () => {
    const merged = mergeDetections([
      [d("HOW TO CONNECT", "Thich Nhat Hanh", 1), d("HOW TO SEE", "Thich Nhat Hanh", 1), d("TRAVELING MERCIES", "Anne Lamott", 0.9)],
      [d("CONNECT", null, 1), d("IND", null, 1), d("et", null, 1), d("Traveling Mercies: Some Thoughts on Faith", null, 0.8)],
    ]);
    expect(merged.map((m) => `${m.title} / ${m.author}`)).toEqual([
      "HOW TO CONNECT / Thich Nhat Hanh",
      "HOW TO SEE / Thich Nhat Hanh",
      "Traveling Mercies: Some Thoughts on Faith / Anne Lamott",
    ]);
    // A short title of its own is kept: "The How" isn't part of "How to See".
    expect(mergeDetections([[d("How to See", "Thich Nhat Hanh"), d("The How", "Yrsa Daley-Ward")]])).toHaveLength(2);
    // A fragment that fits two titles is dropped rather than guessed.
    expect(mergeDetections([[d("The Art of War"), d("The Art of Gathering"), d("Art of")]]).map((m) => m.title)).toEqual([
      "The Art of War",
      "The Art of Gathering",
    ]);
    // Short real titles with an author stay.
    expect(mergeDetections([[d("It", "Stephen King")]])).toHaveLength(1);
  });

  it("drops an author read as a book, and splits a title run together with its author", () => {
    const merged = mergeDetections([
      [d("Bird by Bird", "Anne Lamott"), d("ANNE LAMOTT"), d("Thich Nhat Hanh Peace Begins Here"), d("How to See", "Thich Nhat Hanh")],
    ]);
    expect(merged.map((m) => `${m.title} / ${m.author}`)).toEqual([
      "Bird by Bird / Anne Lamott",
      "Peace Begins Here / Thich Nhat Hanh",
      "How to See / Thich Nhat Hanh",
    ]);
  });
});

describe("readShelf", () => {
  const big = { width: 4032, height: 3024 };

  it("reads every planned pass and merges the books", async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce({ detections: [d("Emma")], layout: NO_LAYOUT })
      .mockResolvedValue({ detections: [d("Dune")], layout: null });
    const progress: string[] = [];
    const result = await readShelf({ ...big, strategy: withTiles, render: async (p) => p.label, read, onProgress: (n, of) => progress.push(`${n}/${of}`) });
    expect(result.passesPlanned).toBe(6);
    expect(result.passesRead).toBe(6);
    expect(result.detections.map((x) => x.title)).toEqual(["Emma", "Dune"]);
    expect(progress[0]).toBe("1/null");
    expect(progress.at(-1)).toBe("6/6");
  });

  it("skips a follow-up pass that fails, but not the first look", async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce({ detections: [d("Emma")], layout: NO_LAYOUT })
      .mockRejectedValueOnce(new Error("GGML_ASSERT"))
      .mockResolvedValue({ detections: [], layout: null });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await readShelf({ ...big, strategy: withTiles, render: async () => "", read });
    expect(result.passesRead).toBe(5);
    await expect(readShelf({ ...big, render: async () => "", read: vi.fn().mockRejectedValue(new Error("down")) })).rejects.toThrow("down");
  });

  it("keeps what it has when told that's enough, and stops everything when cancelled", async () => {
    const enough = new AbortController();
    const read = vi.fn(async () => {
      if (read.mock.calls.length === 2) enough.abort();
      return { detections: [d(`Book ${read.mock.calls.length}`)], layout: NO_LAYOUT };
    });
    const result = await readShelf({ ...big, strategy: withTiles, render: async () => "", read, enough: enough.signal });
    expect(result.passesRead).toBe(2);
    expect(result.detections).toHaveLength(2);

    const cancel = new AbortController();
    const cancelling = vi.fn(async () => {
      cancel.abort();
      throw new DOMException("Cancelled", "AbortError");
    });
    await expect(readShelf({ ...big, render: async () => "", read: cancelling, signal: cancel.signal })).rejects.toThrow("Cancelled");
  });
});
