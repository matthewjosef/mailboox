// Mirrors the Rust types in dnas/library/zomes/{integrity,coordinator}/library.
import type { ActionHash, AgentPubKey, Timestamp } from "@holochain/client";

export type BookSource = "Manual" | "Scan" | "Import";

export interface Book {
  title: string;
  authors: string[];
  isbn: string | null;
  open_library_key: string | null;
  cover_url: string | null;
  genre: string | null;
  blurb: string | null;
  source: BookSource;
}

export type LoanStatus = "AwaitingHandoff" | "ReadyForPickup" | "Active" | "ReturnPending" | "Closed";
export type LoanEventKind =
  | "HandoffNotice"
  | "PickupConfirmation"
  | "ReturnNotice"
  | "ReturnDispute"
  | "ReturnReceipt";
export type HandoffMethod = "BorrowersMailbox" | "OwnersMailbox" | "Other";

export interface LoanView {
  loan_hash: ActionHash;
  book_hash: ActionHash;
  owner: AgentPubKey;
  borrower: AgentPubKey;
  /** The accepted request; the borrower's contact details are attached to it. */
  request: ActionHash;
  started_at: Timestamp;
  status: LoanStatus;
  last_event: LoanEventKind | null;
  last_event_at: Timestamp | null;
  last_notice: ActionHash | null;
  /** Latest handoff or dispute note. */
  last_note: string | null;
  handoff_method: HandoffMethod | null;
}

export interface BookListing {
  book_hash: ActionHash;
  owner: AgentPubKey;
  created_at: Timestamp;
  book: Book;
  open_loan: LoanView | null;
}

export interface RequestView {
  request_hash: ActionHash;
  book_hash: ActionHash;
  requester: AgentPubKey;
  created_at: Timestamp;
}

export interface MyLoans {
  borrowed: LoanView[];
  lent: LoanView[];
}

export interface PendingActions {
  incoming_requests: RequestView[];
  returns_to_confirm: LoanView[];
  ready_for_pickup: LoanView[];
}

/** Map position in hundredths of a degree (about 1 km). */
export interface RoundedPin {
  lat_centi: number;
  lng_centi: number;
}

export interface LibraryProfile {
  area: RoundedPin | null;
}

export interface ContactDetails {
  address: string;
  instructions: string;
}

export type LibrarySignal =
  | { type: "BorrowRequested"; request_hash: ActionHash; book_hash: ActionHash; requester: AgentPubKey }
  | { type: "RequestAccepted"; loan_hash: ActionHash; book_hash: ActionHash }
  | { type: "RequestDeclined"; request_hash: ActionHash; book_hash: ActionHash }
  | { type: "HandoffReady"; loan_hash: ActionHash; book_hash: ActionHash; method: HandoffMethod; note: string | null }
  | { type: "HandoverConfirmed"; loan_hash: ActionHash; book_hash: ActionHash; by: AgentPubKey }
  | { type: "BookReturned"; loan_hash: ActionHash; book_hash: ActionHash; borrower: AgentPubKey }
  | { type: "ReturnDisputed"; loan_hash: ActionHash; book_hash: ActionHash; note: string | null }
  | { type: "ReturnConfirmed"; loan_hash: ActionHash; book_hash: ActionHash }
  | { type: "LocalChange" };

export function emptyBook(source: BookSource = "Manual"): Book {
  return {
    title: "",
    authors: [],
    isbn: null,
    open_library_key: null,
    cover_url: null,
    genre: null,
    blurb: null,
    source,
  };
}
