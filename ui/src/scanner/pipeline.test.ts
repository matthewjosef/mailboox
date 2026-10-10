import { describe, expect, it, vi } from "vitest";

import { scanPhotos } from "./pipeline";

const photo = (name: string) => ({ name }) as unknown as File;
const lookup = { best: null, candidates: [] };

describe("scanPhotos", () => {
  it("keeps the books from photos that worked when another photo fails", async () => {
    const readPhoto = vi.fn(async (file: File) => {
      if (file.name === "big.jpg") throw new Error("GGML_ASSERT(a->ne[2] * 4 == b->ne[0]) failed");
      return [{ title: "Dune", author: null, confidence: 1 }];
    });
    const result = await scanPhotos([photo("shelf1.jpg"), photo("big.jpg")], {
      readPhoto,
      lookup: async () => lookup,
      onProgress: () => {},
      pause: async () => {},
    });
    expect(result.results.map((r) => r.detection.title)).toEqual(["Dune"]);
    expect(result.failures).toEqual([{ photo: 2, name: "big.jpg", message: "GGML_ASSERT(a->ne[2] * 4 == b->ne[0]) failed" }]);
  });

  it("reports progress per photo, per pass and per lookup", async () => {
    const progress: string[] = [];
    await scanPhotos([photo("a.jpg"), photo("b.jpg")], {
      readPhoto: async (_f, _s, onPart) => {
        onPart("close-up 1 of 4");
        return [{ title: "Emma", author: "Jane Austen", confidence: 1 }];
      },
      lookup: async () => lookup,
      onProgress: (p) => progress.push(p),
      pause: async () => {},
    });
    expect(progress).toEqual([
      "Reading photo 1 of 2…",
      "Reading photo 1 of 2: close-up 1 of 4…",
      "Looking up Emma (1 of 1)…",
      "Reading photo 2 of 2…",
      "Reading photo 2 of 2: close-up 1 of 4…",
      "Looking up Emma (1 of 1)…",
    ]);
  });

  it("stops at once when cancelled", async () => {
    const controller = new AbortController();
    const readPhoto = vi.fn(async () => {
      controller.abort();
      return [{ title: "Emma", author: null, confidence: 1 }];
    });
    await expect(
      scanPhotos([photo("a.jpg"), photo("b.jpg")], {
        readPhoto,
        lookup: async () => lookup,
        onProgress: () => {},
        pause: async () => {},
        signal: controller.signal,
      }),
    ).rejects.toThrow("Cancelled");
    expect(readPhoto).toHaveBeenCalledTimes(1);
  });
});
