import { describe, expect, it, vi } from "vitest";

import { scanPhotos } from "./pipeline";

const photo = (name: string) => ({ name }) as unknown as File;
const lookup = { best: null, candidates: [] };

describe("scanPhotos", () => {
  it("keeps the books from photos that worked when another photo fails", async () => {
    const recognize = vi.fn(async (image: string) => {
      if (image === "big.jpg") throw new Error("GGML_ASSERT(a->ne[2] * 4 == b->ne[0]) failed");
      return [{ title: "Dune", author: null, confidence: 1 }];
    });
    const result = await scanPhotos([photo("shelf1.jpg"), photo("big.jpg")], "shelf", {
      prepare: async (f) => (f as unknown as { name: string }).name,
      recognize,
      lookup: async () => lookup,
      onProgress: () => {},
      pause: async () => {},
    });
    expect(result.results.map((r) => r.detection.title)).toEqual(["Dune"]);
    expect(result.failures).toEqual([{ photo: 2, name: "big.jpg", message: "GGML_ASSERT(a->ne[2] * 4 == b->ne[0]) failed" }]);
  });

  it("reports progress per photo and per lookup", async () => {
    const progress: string[] = [];
    await scanPhotos([photo("a.jpg"), photo("b.jpg")], "single", {
      prepare: async () => "img",
      recognize: async () => [{ title: "Emma", author: "Jane Austen", confidence: 1 }],
      lookup: async () => lookup,
      onProgress: (p) => progress.push(p),
      pause: async () => {},
    });
    expect(progress).toEqual([
      "Reading photo 1 of 2…",
      "Looking up Emma (1 of 1)…",
      "Reading photo 2 of 2…",
      "Looking up Emma (1 of 1)…",
    ]);
  });

  it("stops at once when cancelled", async () => {
    const controller = new AbortController();
    const recognize = vi.fn(async () => {
      controller.abort();
      return [{ title: "Emma", author: null, confidence: 1 }];
    });
    await expect(
      scanPhotos([photo("a.jpg"), photo("b.jpg")], "shelf", {
        prepare: async () => "img",
        recognize,
        lookup: async () => lookup,
        onProgress: () => {},
        pause: async () => {},
        signal: controller.signal,
      }),
    ).rejects.toThrow("Cancelled");
    expect(recognize).toHaveBeenCalledTimes(1);
  });
});
