import { SignalType, type ActionHash, type AgentPubKey, type AppClient } from "@holochain/client";

import type {
  Book,
  BookListing,
  ContactDetails,
  HandoffMethod,
  LibraryProfile,
  LibrarySignal,
  LoanView,
  MyLoans,
  PendingActions,
  RequestView,
} from "./types";

export const ROLE_NAME = "library";
export const ZOME_NAME = "library";

/**
 * Copy reactive state (Svelte 5 wraps objects and arrays in Proxies) into plain data.
 * Inside Moss, zome calls are posted to the parent window for signing, and postMessage
 * can't clone Proxies. Hashes (Uint8Array) and primitives pass through unchanged.
 */
export function toPlain<T>(value: T): T {
  if (value === null || typeof value !== "object" || ArrayBuffer.isView(value)) return value;
  if (Array.isArray(value)) return value.map(toPlain) as T;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toPlain(v)])) as T;
}

/** Typed wrapper around the library zome. Works with a plain AppWebsocket or Moss's applet client. */
export class LibraryClient {
  constructor(public client: AppClient) {}

  get myPubKey(): AgentPubKey {
    return this.client.myPubKey;
  }

  private call<T>(fn_name: string, payload: unknown = null): Promise<T> {
    return this.client.callZome({ role_name: ROLE_NAME, zome_name: ZOME_NAME, fn_name, payload: toPlain(payload) });
  }

  // Books
  createBook = (book: Book) => this.call<BookListing>("create_book", book);
  createBooksBatch = (books: Book[]) => this.call<BookListing[]>("create_books_batch", books);
  updateBook = (book_hash: ActionHash, updated_book: Book) =>
    this.call<BookListing>("update_book", { book_hash, updated_book });
  deleteBook = (book_hash: ActionHash) => this.call<ActionHash>("delete_book", book_hash);
  getBook = (book_hash: ActionHash) => this.call<BookListing | null>("get_book", book_hash);
  getAllBooks = () => this.call<BookListing[]>("get_all_books");
  getBooksForOwner = (owner: AgentPubKey) => this.call<BookListing[]>("get_books_for_owner", owner);

  // Requests
  requestBorrow = (book_hash: ActionHash) => this.call<RequestView>("request_borrow", book_hash);
  cancelRequest = (request_hash: ActionHash) => this.call<null>("cancel_request", request_hash);
  declineRequest = (request_hash: ActionHash) => this.call<null>("decline_request", request_hash);
  getRequestsForBook = (book_hash: ActionHash) =>
    this.call<RequestView[]>("get_requests_for_book", book_hash);
  getIncomingRequests = () => this.call<RequestView[]>("get_incoming_requests");
  getMyRequests = () => this.call<RequestView[]>("get_my_requests");

  // Loans
  acceptRequest = (request_hash: ActionHash) => this.call<LoanView>("accept_request", request_hash);
  markReturned = (loan_hash: ActionHash) => this.call<LoanView>("mark_returned", loan_hash);
  confirmReceived = (loan_hash: ActionHash) => this.call<LoanView>("confirm_received", loan_hash);
  disputeReturn = (loan_hash: ActionHash, note: string | null) =>
    this.call<LoanView>("dispute_return", { loan_hash, note });
  leaveForPickup = (loan_hash: ActionHash, method: HandoffMethod, note: string | null) =>
    this.call<LoanView>("leave_for_pickup", { loan_hash, method, note });
  confirmHandover = (loan_hash: ActionHash) => this.call<LoanView>("confirm_handover", loan_hash);
  getLoan = (loan_hash: ActionHash) => this.call<LoanView | null>("get_loan", loan_hash);
  getMyLoans = () => this.call<MyLoans>("get_my_loans");
  getPendingActions = () => this.call<PendingActions>("get_pending_actions");

  // Location and contact details
  setMyProfile = (profile: LibraryProfile) => this.call<null>("set_my_profile", profile);
  getProfile = (agent: AgentPubKey) => this.call<LibraryProfile | null>("get_profile", agent);
  setMyContactDetails = (details: ContactDetails) => this.call<null>("set_my_contact_details", details);
  getMyContactDetails = () => this.call<ContactDetails | null>("get_my_contact_details");
  /** The other party's details for a request (owner) or loan (borrower), if shared with me. */
  getSharedDetails = (context_hash: ActionHash) => this.call<ContactDetails | null>("get_shared_details", context_hash);

  /** Subscribe to signals from the library zome. Returns an unsubscribe function. */
  onSignal(listener: (signal: LibrarySignal) => void): () => void {
    return this.client.on("signal", (signal) => {
      if (signal.type !== SignalType.App || signal.value.zome_name !== ZOME_NAME) return;
      listener(signal.value.payload as LibrarySignal);
    });
  }
}
