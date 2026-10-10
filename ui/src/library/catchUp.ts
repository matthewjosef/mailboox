import { encodeHashToBase64, type ActionHash, type AgentPubKey } from "@holochain/client";

import { notificationFor, type LibraryNotification } from "./notifications";
import type { PendingActions } from "./types";

export interface CatchUpItem {
  notification: LibraryNotification;
  about: ActionHash;
  from: AgentPubKey;
}

interface Context {
  titleOf: (bookHash: ActionHash) => string | undefined;
  nameOf: (agent: AgentPubKey) => string;
}

/**
 * Signals are lost while we're offline. On startup, notify about pending
 * requests and returns we haven't told the person about yet. Returns the
 * notifications plus the new "seen" set (only keys still pending are kept).
 */
export function catchUp(
  pending: PendingActions,
  seen: Set<string>,
  ctx: Context,
): { items: CatchUpItem[]; seen: Set<string> } {
  const items: CatchUpItem[] = [];
  const stillPending = new Set<string>();

  for (const r of pending.incoming_requests) {
    const key = `request:${encodeHashToBase64(r.request_hash)}`;
    stillPending.add(key);
    if (seen.has(key)) continue;
    const notification = notificationFor(
      { type: "BorrowRequested", request_hash: r.request_hash, book_hash: r.book_hash, requester: r.requester },
      ctx,
    );
    if (notification) items.push({ notification, about: r.book_hash, from: r.requester });
  }

  for (const loan of pending.returns_to_confirm) {
    // Keyed by the notice time, so a second "I've returned it" after a dispute notifies again.
    const key = `return:${encodeHashToBase64(loan.loan_hash)}:${loan.last_event_at}`;
    stillPending.add(key);
    if (seen.has(key)) continue;
    const notification = notificationFor(
      { type: "BookReturned", loan_hash: loan.loan_hash, book_hash: loan.book_hash, borrower: loan.borrower },
      ctx,
    );
    if (notification) items.push({ notification, about: loan.book_hash, from: loan.borrower });
  }

  return { items, seen: stillPending };
}
