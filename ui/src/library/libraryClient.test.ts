import { describe, expect, it, vi } from "vitest";

import { LibraryClient, toPlain } from "./libraryClient";
import { emptyBook } from "./types";

/** What Svelte 5's $state does to objects and arrays: wraps them in Proxies. */
function deepProxy<T>(value: T): T {
  if (value instanceof Uint8Array || typeof value !== "object" || value === null) return value;
  const target: any = Array.isArray(value) ? value.map(deepProxy) : Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deepProxy(v)]));
  return new Proxy(target, {});
}

describe("toPlain", () => {
  it("makes reactive state safe to postMessage (Moss signs zome calls in its parent window)", () => {
    const books = deepProxy([{ ...emptyBook("Scan"), title: "Tribe of Mentors", authors: ["Timothy Ferriss"] }]);
    expect(() => structuredClone(books)).toThrow();
    const plain = toPlain(books);
    expect(() => structuredClone(plain)).not.toThrow();
    expect(plain).toEqual([{ ...emptyBook("Scan"), title: "Tribe of Mentors", authors: ["Timothy Ferriss"] }]);
  });

  it("keeps hashes as Uint8Arrays and leaves primitives alone", () => {
    const hash = new Uint8Array(39).fill(7);
    const plain = toPlain(deepProxy({ loan_hash: hash, note: null, n: 1 }));
    expect(plain.loan_hash).toBe(hash);
    expect(plain).toEqual({ loan_hash: hash, note: null, n: 1 });
  });
});

describe("LibraryClient", () => {
  it("sends plain payloads, so batch adds from the scanner work inside Moss", async () => {
    const callZome = vi.fn(async (req: { payload: unknown }) => {
      structuredClone(req); // throws on Proxies, like postMessage
      return [];
    });
    const client = new LibraryClient({ callZome, on: vi.fn(), myPubKey: new Uint8Array(39) } as any);
    const books = deepProxy([{ ...emptyBook("Scan"), title: "All Marketers Are Liars" }]);
    await expect(client.createBooksBatch(books)).resolves.toEqual([]);
  });
});
