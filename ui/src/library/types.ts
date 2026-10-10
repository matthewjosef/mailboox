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

export type LoanStatus = "Active" | "ReturnPending" | "Closed";
export type LoanEventKind = "ReturnNotice" | "ReturnDispute" | "ReturnReceipt";

export interface LoanView {
  loan_hash: ActionHash;
  book_hash: ActionHash;
  owner: AgentPubKey;
  borrower: AgentPubKey;
  started_at: Timestamp;
  status: LoanStatus;
  last_event: LoanEventKind | null;
  last_event_at: Timestamp | null;
  last_notice: ActionHash | null;
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
}

export type LibrarySignal =
  | { type: "BorrowRequested"; request_hash: ActionHash; book_hash: ActionHash; requester: AgentPubKey }
  | { type: "RequestAccepted"; loan_hash: ActionHash; book_hash: ActionHash }
  | { type: "RequestDeclined"; request_hash: ActionHash; book_hash: ActionHash }
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
