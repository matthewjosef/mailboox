import { describe, expect, it } from "vitest";

import { friendlyError } from "./errors";

describe("friendlyError", () => {
  it("extracts guest errors raised by the coordinator zome", () => {
    const e = { name: "internal_error", message: 'Wasm runtime error while working with Ribosome: RuntimeError: WasmError { file: "src/loans.rs", line: 1, error: Guest("This book is already on loan") }' };
    expect(friendlyError(e)).toBe("This book is already on loan");
  });

  it("extracts validation failures", () => {
    const e = new Error("Source chain error: InvalidCommit error: Only the borrower can mark a book as returned");
    expect(friendlyError(e)).toBe("Only the borrower can mark a book as returned");
  });

  it("falls back to the raw message", () => {
    expect(friendlyError(new Error("Websocket closed"))).toBe("Websocket closed");
    expect(friendlyError("boom")).toBe("boom");
  });
});
