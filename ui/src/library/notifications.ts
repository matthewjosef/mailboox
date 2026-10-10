import type { ActionHash, AgentPubKey } from "@holochain/client";

import type { LibrarySignal } from "./types";

export type Urgency = "low" | "medium" | "high";

export interface LibraryNotification {
  title: string;
  body: string;
  urgency: Urgency;
}

interface Context {
  titleOf: (bookHash: ActionHash) => string | undefined;
  nameOf: (agent: AgentPubKey) => string;
}

/** Turn a zome signal into something to show the person, or null if it's just a refresh. */
export function notificationFor(signal: LibrarySignal, { titleOf, nameOf }: Context): LibraryNotification | null {
  if (signal.type === "LocalChange") return null;
  const title = titleOf(signal.book_hash) ?? "a book";

  switch (signal.type) {
    case "BorrowRequested":
      return {
        title: `${nameOf(signal.requester)} would like to borrow ${title}`,
        body: "Accept to lend it out, then leave it in your mailbox for pickup.",
        urgency: "high",
      };
    case "RequestAccepted":
      return {
        title: `You can borrow ${title}`,
        body: "Your request was accepted. Pick it up from the owner's mailbox.",
        urgency: "medium",
      };
    case "RequestDeclined":
      return {
        title: `Request for ${title} declined`,
        body: "The owner can't lend it right now.",
        urgency: "low",
      };
    case "BookReturned":
      return {
        title: `${nameOf(signal.borrower)} returned ${title}`,
        body: "Check your mailbox, then confirm you got it back (or say it hasn't arrived).",
        urgency: "high",
      };
    case "ReturnDisputed":
      return {
        title: `${title} hasn't arrived yet`,
        body: signal.note
          ? `The owner says: “${signal.note}”`
          : "The owner hasn't found it in their mailbox yet.",
        urgency: "high",
      };
    case "ReturnConfirmed":
      return {
        title: `Return of ${title} confirmed`,
        body: "The owner has it back. Thanks for borrowing!",
        urgency: "medium",
      };
  }
}
