import { describe, expect, it, vi } from "vitest";

import { checkOllama, recognize } from "./ollama";

function routes(map: Record<string, (body?: any) => unknown>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    const handler = map[path];
    if (!handler) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(handler(init?.body ? JSON.parse(String(init.body)) : undefined)), { status: 200 });
  });
}

describe("checkOllama", () => {
  it("is unreachable when Ollama isn't running or blocks this origin", async () => {
    const down = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await checkOllama(down)).toEqual({ state: "unreachable" });
  });

  it("finds installed models that can see images", async () => {
    const fetch = routes({
      "/api/version": () => ({ version: "0.13.5" }),
      "/api/tags": () => ({ models: [{ name: "llama3.2:3b" }, { name: "qwen2.5vl:7b" }] }),
      "/api/show": (body) => ({ capabilities: body.model.startsWith("qwen") ? ["completion", "vision"] : ["completion"] }),
    });
    expect(await checkOllama(fetch)).toEqual({ state: "ready", visionModels: ["qwen2.5vl:7b"] });
  });

  it("says when no installed model can see images", async () => {
    const fetch = routes({
      "/api/version": () => ({ version: "0.13.5" }),
      "/api/tags": () => ({ models: [{ name: "llama3.2:3b" }] }),
      "/api/show": () => ({ capabilities: ["completion"] }),
    });
    expect(await checkOllama(fetch)).toEqual({ state: "noVisionModel" });
  });
});

describe("recognize", () => {
  it("sends the photo to the chosen model and parses the books it read", async () => {
    const fetch = routes({
      "/api/chat": (body) => {
        expect(body.model).toBe("qwen2.5vl:7b");
        expect(body.messages[0].images).toEqual(["IMG"]);
        return { message: { content: JSON.stringify({ books: [{ title: "Emma", author: "Jane Austen", confidence: 0.9 }] }) } };
      },
    });
    expect(await recognize("qwen2.5vl:7b", "IMG", "single", { fetchFn: fetch })).toEqual([
      { title: "Emma", author: "Jane Austen", confidence: 0.9 },
    ]);
  });

  it("explains Ollama errors", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ error: "model 'x' not found" }), { status: 404 }));
    await expect(recognize("x", "IMG", "shelf", { fetchFn: fetch })).rejects.toThrow("model 'x' not found");
  });
});
