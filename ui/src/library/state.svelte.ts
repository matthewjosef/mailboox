import { encodeHashToBase64, type ActionHash, type AgentPubKey } from "@holochain/client";

import { sameHash } from "./actions";
import { friendlyError } from "./errors";
import type { LibraryClient } from "./libraryClient";
import { notificationFor, type LibraryNotification } from "./notifications";
import type { BookListing, LibrarySignal, MyLoans, RequestView } from "./types";

export type Route =
  | { name: "library" }
  | { name: "mine" }
  | { name: "book"; bookHash: ActionHash }
  | { name: "add" }
  | { name: "edit"; bookHash: ActionHash }
  | { name: "inbox" }
  | { name: "loans" };

export interface Notifier {
  notify(notification: LibraryNotification, signal: LibrarySignal): void;
}

/** App-wide reactive state. Refreshes from the zome and reacts to signals. */
export class LibraryState {
  books = $state<BookListing[]>([]);
  myRequests = $state<RequestView[]>([]);
  incomingRequests = $state<RequestView[]>([]);
  loans = $state<MyLoans>({ borrowed: [], lent: [] });
  loading = $state(true);
  busy = $state(false);
  error = $state<string | null>(null);
  route = $state<Route>({ name: "library" });

  constructor(
    public api: LibraryClient,
    public nameOf: (agent: AgentPubKey) => string,
    private notifier: Notifier,
  ) {
    api.onSignal((signal) => this.onSignal(signal));
  }

  get me(): AgentPubKey {
    return this.api.myPubKey;
  }

  get myBooks(): BookListing[] {
    return this.books.filter((b) => sameHash(b.owner, this.me));
  }

  /** Requests and returns waiting on me, for the inbox badge. */
  get inboxCount(): number {
    return this.incomingRequests.length + this.loans.lent.filter((l) => l.status === "ReturnPending").length;
  }

  listing(bookHash: ActionHash): BookListing | undefined {
    return this.books.find((b) => sameHash(b.book_hash, bookHash));
  }

  titleOf = (bookHash: ActionHash): string | undefined => this.listing(bookHash)?.book.title;

  /** Open requests for a book that I can see: all of them if it's mine, otherwise just my own. */
  requestsFor(bookHash: ActionHash): RequestView[] {
    return [...this.incomingRequests, ...this.myRequests].filter((r) => sameHash(r.book_hash, bookHash));
  }

  async refresh() {
    try {
      const [books, myRequests, incomingRequests, loans] = await Promise.all([
        this.api.getAllBooks(),
        this.api.getMyRequests(),
        this.api.getIncomingRequests(),
        this.api.getMyLoans(),
      ]);
      this.books = books;
      this.myRequests = myRequests;
      this.incomingRequests = incomingRequests;
      this.loans = loans;
      this.error = null;
    } catch (e) {
      this.error = friendlyError(e);
    } finally {
      this.loading = false;
    }
  }

  /** Run a zome action, show its error if it fails, and refresh either way. */
  async run<T>(action: () => Promise<T>): Promise<T | undefined> {
    this.busy = true;
    try {
      const result = await action();
      this.error = null;
      return result;
    } catch (e) {
      this.error = friendlyError(e);
      return undefined;
    } finally {
      this.busy = false;
      await this.refresh();
    }
  }

  /** "Your shelf" or "Sam's shelf". */
  shelfOf(owner: AgentPubKey): string {
    return sameHash(owner, this.me) ? "Your shelf" : `${this.nameOf(owner)}'s shelf`;
  }

  /**
   * Other people's new books don't send us signals, so poll gently and refresh
   * whenever the window comes back into focus. Returns a stop function.
   */
  startAutoRefresh(intervalMs = 15000): () => void {
    const timer = setInterval(() => {
      if (!this.busy && document.visibilityState === "visible") this.refresh();
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") this.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }

  go(route: Route) {
    this.route = route;
    this.error = null;
  }

  private refreshTimers: ReturnType<typeof setTimeout>[] = [];

  private onSignal(signal: LibrarySignal) {
    const notification = notificationFor(signal, { titleOf: this.titleOf, nameOf: this.nameOf });
    if (notification) this.notifier.notify(notification, signal);
    // A remote signal usually arrives before the other person's data has reached
    // our node, so refresh a few times. Bursts of signals reset the schedule.
    this.refreshTimers.forEach(clearTimeout);
    const delays = signal.type === "LocalChange" ? [300] : [300, 3000, 8000];
    this.refreshTimers = delays.map((ms) => setTimeout(() => this.refresh(), ms));
  }
}

export const hashKey = (h: Uint8Array) => encodeHashToBase64(h);
