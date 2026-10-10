import { describe, expect, it } from "vitest";

import { buildChatRequest, parseDetections, parseLayout } from "./recognition";

describe("buildChatRequest", () => {
  it("asks for structured JSON with the photo attached, deterministically", () => {
    const req = buildChatRequest("qwen2.5vl:7b", "BASE64", "shelf");
    expect(req.model).toBe("qwen2.5vl:7b");
    expect(req.stream).toBe(false);
    expect(req.options.temperature).toBe(0);
    // A shelf photo alone is ~2,600 tokens; Ollama's default 4,096 context overflows on a full
    // shelf and crashes qwen2.5vl with GGML_ASSERT(a->ne[2] * 4 == b->ne[0]).
    expect(req.options.num_ctx).toBeGreaterThanOrEqual(12288);
    expect(req.options.num_predict).toBeGreaterThan(0);
    expect(req.messages[0].images).toEqual(["BASE64"]);
    expect(req.messages[0].content).toMatch(/every book/i);
    expect(req.format.properties.books.type).toBe("array");
  });

  it("uses a single-book prompt for one book", () => {
    expect(buildChatRequest("m", "B", "single").messages[0].content).toMatch(/one book/i);
  });
});

describe("parseDetections", () => {
  it("reads the model's JSON, trimming, clamping and dropping junk", () => {
    const raw = JSON.stringify({
      books: [
        { title: " Frankenstein ", author: "Mary Shelley", confidence: 0.92 },
        { title: "", author: "Nobody", confidence: 0.9 },
        { title: "Dune", author: "", confidence: 7 },
        { title: "Unreadable", author: null, confidence: -1 },
      ],
    });
    expect(parseDetections(raw)).toEqual([
      { title: "Frankenstein", author: "Mary Shelley", confidence: 0.92 },
      { title: "Dune", author: null, confidence: 1 },
      { title: "Unreadable", author: null, confidence: 0 },
    ]);
  });

  it("merges the same book seen twice, keeping the more confident reading", () => {
    const raw = JSON.stringify({
      books: [
        { title: "Brave New World", author: null, confidence: 0.5 },
        { title: "brave new world", author: "Aldous Huxley", confidence: 0.9 },
      ],
    });
    expect(parseDetections(raw)).toEqual([{ title: "brave new world", author: "Aldous Huxley", confidence: 0.9 }]);
  });

  it("copes with a bare array or a fenced code block, and returns nothing for garbage", () => {
    expect(parseDetections('[{"title":"Emma","author":"Jane Austen","confidence":0.8}]')).toHaveLength(1);
    expect(parseDetections('```json\n{"books":[{"title":"Emma"}]}\n```')).toEqual([
      { title: "Emma", author: null, confidence: 0.5 },
    ]);
    expect(parseDetections("I can't read this image")).toEqual([]);
  });
});

describe("shelf layout", () => {
  it("asks the first look at a shelf for the layout, and mentions flat and leaning books", () => {
    const req = buildChatRequest("m", "B", "shelf");
    expect(req.format.required).toContain("layout");
    expect(req.messages[0].content).toMatch(/lie flat/);
    expect(req.messages[0].content).toMatch(/lean/);
    expect(buildChatRequest("m", "B", "part").format.required).toEqual(["books"]);
  });

  it("reads the layout, trusting a clear tilt even if 'leaning' wasn't ticked", () => {
    expect(parseLayout('{"books":[],"layout":{"upright":true,"flat":true,"leaning":false,"leanDegrees":0}}')).toEqual({
      upright: true,
      flat: true,
      leaning: false,
      leanDegrees: null,
    });
    expect(parseLayout('{"books":[],"layout":{"upright":false,"flat":false,"leaning":false,"leanDegrees":-35}}')).toMatchObject({
      leaning: true,
      leanDegrees: -35,
    });
    expect(parseLayout('{"books":[]}')).toBeNull();
    // One leaning book is enough, even when the overall layout missed it.
    expect(
      parseLayout('{"books":[{"title":"Dune","orientation":"leaning"}],"layout":{"upright":false,"flat":true,"leaning":false,"leanDegrees":0}}'),
    ).toMatchObject({ flat: true, leaning: true, leanDegrees: null });
    expect(parseLayout("garbage")).toBeNull();
  });
});
