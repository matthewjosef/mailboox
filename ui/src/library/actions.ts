import { encodeHashToBase64, type AgentPubKey, type HoloHash } from "@holochain/client";

import type { BookListing, LoanView, RequestView } from "./types";

export function sameHash(a: HoloHash, b: HoloHash): boolean {
  return encodeHashToBase64(a) === encodeHashToBase64(b);
}

export type BookAction =
  | { kind: "request"; disabledReason?: string }
  | { kind: "cancelRequest"; request: RequestView; disabledReason?: string }
  | { kind: "accept"; request: RequestView; disabledReason?: string }
  | { kind: "decline"; request: RequestView; disabledReason?: string }
  | { kind: "handedOver"; loan: LoanView; disabledReason?: string }
  | { kind: "leftInBorrowersMailbox"; loan: LoanView; disabledReason?: string }
  | { kind: "leftInMyMailbox"; loan: LoanView; disabledReason?: string }
  | { kind: "cancelLoan"; loan: LoanView; disabledReason?: string }
  | { kind: "pickedUp"; loan: LoanView; disabledReason?: string }
  | { kind: "markReturned"; loan: LoanView; disabledReason?: string }
  | { kind: "markReceived"; loan: LoanView; disabledReason?: string }
  | { kind: "notReceived"; loan: LoanView; disabledReason?: string }
  | { kind: "edit"; disabledReason?: string }
  | { kind: "delete"; disabledReason?: string };

interface BookActionsInput {
  listing: BookListing;
  me: AgentPubKey;
  /** Open borrow requests for this book. */
  requests: RequestView[];
}

/** Which buttons a person sees on a book, given who they are and where the loan stands. */
export function bookActions({ listing, me, requests }: BookActionsInput): BookAction[] {
  const loan = listing.open_loan;
  const isOwner = sameHash(listing.owner, me);

  if (!isOwner) {
    if (loan && sameHash(loan.borrower, me)) {
      if (loan.status === "AwaitingHandoff" || loan.status === "ReadyForPickup") return [{ kind: "pickedUp", loan }];
      return loan.status === "Active" ? [{ kind: "markReturned", loan }] : [];
    }
    const mine = requests.find((r) => sameHash(r.requester, me));
    return mine ? [{ kind: "cancelRequest", request: mine }] : [{ kind: "request" }];
  }

  const actions: BookAction[] = [];
  const onLoanReason = loan ? "This book is on loan right now" : undefined;
  for (const request of requests) {
    actions.push({ kind: "accept", request, disabledReason: onLoanReason });
    actions.push({ kind: "decline", request });
  }
  if (loan?.status === "AwaitingHandoff") {
    actions.push({ kind: "handedOver", loan });
    actions.push({ kind: "leftInBorrowersMailbox", loan });
    actions.push({ kind: "leftInMyMailbox", loan });
    actions.push({ kind: "cancelLoan", loan });
  } else if (loan?.status === "ReadyForPickup") {
    actions.push({ kind: "handedOver", loan });
    actions.push({ kind: "cancelLoan", loan });
  } else if (loan) {
    actions.push({ kind: "markReceived", loan });
    if (loan.status === "ReturnPending") actions.push({ kind: "notReceived", loan });
  }
  actions.push({ kind: "edit" });
  if (!loan) actions.push({ kind: "delete" });
  return actions;
}

export type LoanStatusView =
  | { kind: "available" }
  | { kind: "onLoan" }
  | { kind: "borrowedByMe" }
  | { kind: "waitingForHandoff" }
  | { kind: "readyForMe" }
  | { kind: "toHandOver"; borrower: AgentPubKey }
  | { kind: "leftFor"; borrower: AgentPubKey }
  | { kind: "iMarkedReturned" }
  | { kind: "lentOut"; borrower: AgentPubKey }
  | { kind: "returnClaimed"; borrower: AgentPubKey };

/** Where a book stands, from the viewer's point of view. */
export function loanStatusFor(listing: BookListing, me: AgentPubKey): LoanStatusView {
  const loan = listing.open_loan;
  if (!loan) return { kind: "available" };
  const pending = loan.status === "ReturnPending";
  const iBorrow = sameHash(loan.borrower, me);
  const iOwn = sameHash(listing.owner, me);
  if (loan.status === "AwaitingHandoff") {
    if (iBorrow) return { kind: "waitingForHandoff" };
    if (iOwn) return { kind: "toHandOver", borrower: loan.borrower };
    return { kind: "onLoan" };
  }
  if (loan.status === "ReadyForPickup") {
    if (iBorrow) return { kind: "readyForMe" };
    if (iOwn) return { kind: "leftFor", borrower: loan.borrower };
    return { kind: "onLoan" };
  }
  if (iBorrow) return pending ? { kind: "iMarkedReturned" } : { kind: "borrowedByMe" };
  if (iOwn) {
    return pending ? { kind: "returnClaimed", borrower: loan.borrower } : { kind: "lentOut", borrower: loan.borrower };
  }
  return { kind: "onLoan" };
}
