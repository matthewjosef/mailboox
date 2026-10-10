import { describe, expect, it } from "vitest";

import { catchUp } from "./catchUp";
import type { LoanView, PendingActions, RequestView } from "./types";

const hash = (n: number) => new Uint8Array(39).fill(n);
const ctx = { titleOf: () => "Frankenstein", nameOf: () => "Bob" };

const request: RequestView = { request_hash: hash(1), book_hash: hash(2), requester: hash(3), created_at: 10 };
const pendingReturn: LoanView = {
  loan_hash: hash(4),
  book_hash: hash(2),
  owner: hash(5),
  borrower: hash(3),
  started_at: 5,
  status: "ReturnPending",
  last_event: "ReturnNotice",
  last_event_at: 20,
  last_notice: hash(6),
};
const pending: PendingActions = { incoming_requests: [request], returns_to_confirm: [pendingReturn] };

describe("catchUp", () => {
  it("notifies about everything the first time", () => {
    const { items, seen } = catchUp(pending, new Set(), ctx);
    expect(items.map((i) => i.notification.title)).toEqual([
      "Bob would like to borrow Frankenstein",
      "Bob returned Frankenstein",
    ]);
    expect(items[1].from).toEqual(hash(3));
    expect(seen.size).toBe(2);
  });

  it("doesn't repeat what was already notified", () => {
    const first = catchUp(pending, new Set(), ctx);
    const second = catchUp(pending, first.seen, ctx);
    expect(second.items).toEqual([]);
  });

  it("notifies again when the borrower marks it returned a second time", () => {
    const first = catchUp(pending, new Set(), ctx);
    const again = { ...pending, returns_to_confirm: [{ ...pendingReturn, last_event_at: 99 }] };
    expect(catchUp(again, first.seen, ctx).items).toHaveLength(1);
  });

  it("forgets items that are no longer pending", () => {
    const first = catchUp(pending, new Set(), ctx);
    const { seen } = catchUp({ incoming_requests: [], returns_to_confirm: [] }, first.seen, ctx);
    expect(seen.size).toBe(0);
  });
});
