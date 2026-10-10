import { describe, expect, it, vi } from "vitest";

import { mergeDetections, NO_LAYOUT, planPasses, readShelf, type Layout } from "./passes";
import type { Detection } from "./recognition";

const d = (title: string, author: string | null = null, confidence = 0.8): Detection => ({ title, author, confidence });

describe("planPasses", () => {
  it("adds overlapping close-ups covering a big photo, plus a sideways copy for upright spines", () => {
    const passes = planPasses(4032, 3024, NO_LAYOUT);
    const tiles = passes.filter((p) => p.label.startsWith("close-up"));
    expect(tiles).toHaveLength(4);
    // Corners covered, neighbours overlap.
    expect(tiles[0].rect).toMatchObject({ x: 0, y: 0 });
    expect(tiles[3].rect.x + tiles[3].rect.w).toBeCloseTo(1);
    expect(tiles[1].rect.x).toBeLessThan(tiles[0].rect.w);
    expect(passes.find((p) => p.rotate === -90)).toBeDefined();
  });

  it("uses a wider grid for a long, low shelf and none for a small photo", () => {
    expect(planPasses(4000, 1500, NO_LAYOUT).filter((p) => p.label.startsWith("close-up"))).toHaveLength(6);
    expect(planPasses(960, 644, NO_LAYOUT).filter((p) => p.label.startsWith("close-up"))).toHaveLength(0);
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
});

describe("readShelf", () => {
  const big = { width: 4032, height: 3024 };

  it("reads every planned pass and merges the books", async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce({ detections: [d("Emma")], layout: NO_LAYOUT })
      .mockResolvedValue({ detections: [d("Dune")], layout: null });
    const progress: string[] = [];
    const result = await readShelf({ ...big, render: async (p) => p.label, read, onProgress: (n, of) => progress.push(`${n}/${of}`) });
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
    const result = await readShelf({ ...big, render: async () => "", read });
    expect(result.passesRead).toBe(5);
    await expect(readShelf({ ...big, render: async () => "", read: vi.fn().mockRejectedValue(new Error("down")) })).rejects.toThrow("down");
  });

  it("keeps what it has when told that's enough, and stops everything when cancelled", async () => {
    const enough = new AbortController();
    const read = vi.fn(async () => {
      if (read.mock.calls.length === 2) enough.abort();
      return { detections: [d(`Book ${read.mock.calls.length}`)], layout: NO_LAYOUT };
    });
    const result = await readShelf({ ...big, render: async () => "", read, enough: enough.signal });
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
