import { describe, expect, it } from "vitest";

import { notificationFor } from "./notifications";
import type { LibrarySignal } from "./types";

const hash = (n: number) => new Uint8Array(39).fill(n);
const titles = new Map([["book", "Frankenstein"]]);
const ctx = {
  titleOf: (_h: Uint8Array) => titles.get("book"),
  nameOf: (_h: Uint8Array) => "Bob",
};

describe("notificationFor", () => {
  it("tells the owner, urgently, that the borrower says it's back", () => {
    const signal: LibrarySignal = { type: "BookReturned", loan_hash: hash(1), book_hash: hash(2), borrower: hash(3) };
    expect(notificationFor(signal, ctx)).toEqual({
      title: "Bob returned Frankenstein",
      body: "Check your mailbox, then confirm you got it back (or say it hasn't arrived).",
      urgency: "high",
    });
  });

  it("tells the owner about a new borrow request", () => {
    const signal: LibrarySignal = { type: "BorrowRequested", request_hash: hash(1), book_hash: hash(2), requester: hash(3) };
    expect(notificationFor(signal, ctx)?.title).toBe("Bob would like to borrow Frankenstein");
    expect(notificationFor(signal, ctx)?.urgency).toBe("high");
  });

  it("passes the owner's note along with a dispute", () => {
    const signal: LibrarySignal = { type: "ReturnDisputed", loan_hash: hash(1), book_hash: hash(2), note: "Not in the box" };
    expect(notificationFor(signal, ctx)?.body).toContain("Not in the box");
  });

  it("falls back to 'a book' when the title isn't loaded yet", () => {
    const signal: LibrarySignal = { type: "ReturnConfirmed", loan_hash: hash(1), book_hash: hash(2) };
    expect(notificationFor(signal, { ...ctx, titleOf: () => undefined })?.title).toBe(
      "Return of a book confirmed",
    );
  });

  it("tells the borrower where the book was left, with the owner's note", () => {
    const signal: LibrarySignal = {
      type: "HandoffReady",
      loan_hash: hash(1),
      book_hash: hash(2),
      method: "BorrowersMailbox",
      note: "Blue box by the gate",
    };
    expect(notificationFor(signal, ctx)).toEqual({
      title: "Frankenstein is in your mailbox",
      body: "The owner says: “Blue box by the gate”. Tap “Picked it up” once you have it.",
      urgency: "high",
    });
    const atOwners = notificationFor({ ...signal, method: "OwnersMailbox", note: null }, ctx);
    expect(atOwners?.title).toBe("Frankenstein is ready to pick up");
    expect(atOwners?.body).toBe("It's in the owner's mailbox. Tap “Picked it up” once you have it.");
  });

  it("tells the other party when the book changed hands", () => {
    const signal: LibrarySignal = { type: "HandoverConfirmed", loan_hash: hash(1), book_hash: hash(2), by: hash(3) };
    expect(notificationFor(signal, ctx)?.title).toBe("Bob has Frankenstein");
  });

  it("ignores local refresh signals", () => {
    expect(notificationFor({ type: "LocalChange" }, ctx)).toBeNull();
  });
});
