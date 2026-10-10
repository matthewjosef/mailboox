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
  request: hash(7),
  started_at: 5,
  status: "ReturnPending",
  last_event: "ReturnNotice",
  last_event_at: 20,
  last_notice: hash(6),
  last_note: null,
  handoff_method: null,
};
const pending: PendingActions = { incoming_requests: [request], returns_to_confirm: [pendingReturn], ready_for_pickup: [] };

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

  it("tells a borrower who was offline that a book was left for them", () => {
    const left: LoanView = {
      ...pendingReturn,
      status: "ReadyForPickup",
      last_event: "HandoffNotice",
      handoff_method: "OwnersMailbox",
      last_note: "Under the porch",
    };
    const { items } = catchUp({ incoming_requests: [], returns_to_confirm: [], ready_for_pickup: [left] }, new Set(), ctx);
    expect(items.map((i) => i.notification.title)).toEqual(["Frankenstein is ready to pick up"]);
    expect(items[0].from).toEqual(hash(5));
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
    const { seen } = catchUp({ incoming_requests: [], returns_to_confirm: [], ready_for_pickup: [] }, first.seen, ctx);
    expect(seen.size).toBe(0);
  });
});
