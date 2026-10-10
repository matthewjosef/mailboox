import { describe, expect, it } from "vitest";

import { bookActions, loanStatusFor, sameHash } from "./actions";
import type { BookListing, LoanView, RequestView } from "./types";
import { emptyBook } from "./types";

const hash = (n: number) => new Uint8Array(39).fill(n);
const alice = hash(1);
const bob = hash(2);
const carol = hash(3);
const bookHash = hash(10);

function listing(openLoan: LoanView | null = null): BookListing {
  return {
    book_hash: bookHash,
    owner: alice,
    created_at: 0,
    book: { ...emptyBook(), title: "Frankenstein" },
    open_loan: openLoan,
  };
}

function loan(status: LoanView["status"], borrower = bob): LoanView {
  return {
    loan_hash: hash(20),
    book_hash: bookHash,
    owner: alice,
    borrower,
    started_at: 0,
    status,
    last_event: status === "ReturnPending" ? "ReturnNotice" : null,
    last_event_at: null,
    last_notice: status === "ReturnPending" ? hash(21) : null,
  };
}

function request(requester: Uint8Array, n = 30): RequestView {
  return { request_hash: hash(n), book_hash: bookHash, requester, created_at: 0 };
}

const kinds = (actions: { kind: string }[]) => actions.map((a) => a.kind);

describe("sameHash", () => {
  it("compares hash bytes, not object identity", () => {
    expect(sameHash(hash(1), new Uint8Array(39).fill(1))).toBe(true);
    expect(sameHash(hash(1), hash(2))).toBe(false);
  });
});

describe("bookActions for a visitor", () => {
  it("offers to borrow an available book", () => {
    expect(kinds(bookActions({ listing: listing(), me: bob, requests: [] }))).toEqual(["request"]);
  });

  it("offers to withdraw a pending request instead", () => {
    const actions = bookActions({ listing: listing(), me: bob, requests: [request(bob)] });
    expect(kinds(actions)).toEqual(["cancelRequest"]);
  });

  it("still lets someone queue a request while the book is out to another person", () => {
    const actions = bookActions({ listing: listing(loan("Active", carol)), me: bob, requests: [] });
    expect(kinds(actions)).toEqual(["request"]);
  });
});

describe("bookActions for the borrower", () => {
  it("offers \"I've returned it\" while the loan is active", () => {
    const actions = bookActions({ listing: listing(loan("Active")), me: bob, requests: [] });
    expect(kinds(actions)).toEqual(["markReturned"]);
  });

  it("offers nothing while waiting for the owner to confirm", () => {
    const actions = bookActions({ listing: listing(loan("ReturnPending")), me: bob, requests: [] });
    expect(kinds(actions)).toEqual([]);
  });
});

describe("bookActions for the owner", () => {
  it("can edit or delete an available book", () => {
    expect(kinds(bookActions({ listing: listing(), me: alice, requests: [] }))).toEqual(["edit", "delete"]);
  });

  it("can accept or decline each request", () => {
    const actions = bookActions({
      listing: listing(),
      me: alice,
      requests: [request(bob, 30), request(carol, 31)],
    });
    expect(kinds(actions)).toEqual(["accept", "decline", "accept", "decline", "edit", "delete"]);
  });

  it("can mark an active loan received, but not delete the book", () => {
    const actions = bookActions({ listing: listing(loan("Active")), me: alice, requests: [] });
    expect(kinds(actions)).toEqual(["markReceived", "edit"]);
  });

  it("can confirm or dispute a pending return", () => {
    const actions = bookActions({ listing: listing(loan("ReturnPending")), me: alice, requests: [] });
    expect(kinds(actions)).toEqual(["markReceived", "notReceived", "edit"]);
  });

  it("can't accept a new request while the book is out", () => {
    const actions = bookActions({ listing: listing(loan("Active")), me: alice, requests: [request(carol)] });
    const accept = actions.find((a) => a.kind === "accept");
    expect(accept?.disabledReason).toMatch(/on loan/);
  });
});

describe("loanStatusFor", () => {
  it("describes the book from each person's point of view", () => {
    expect(loanStatusFor(listing(), bob)).toEqual({ kind: "available" });
    expect(loanStatusFor(listing(loan("Active")), bob)).toEqual({ kind: "borrowedByMe" });
    expect(loanStatusFor(listing(loan("ReturnPending")), bob)).toEqual({ kind: "iMarkedReturned" });
    expect(loanStatusFor(listing(loan("Active")), alice)).toEqual({ kind: "lentOut", borrower: bob });
    expect(loanStatusFor(listing(loan("ReturnPending")), alice)).toEqual({ kind: "returnClaimed", borrower: bob });
    expect(loanStatusFor(listing(loan("Active")), carol)).toEqual({ kind: "onLoan" });
  });
});
