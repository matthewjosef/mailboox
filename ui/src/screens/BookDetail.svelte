<script lang="ts">
  import type { ActionHash } from "@holochain/client";

  import BookCover from "../components/BookCover.svelte";
  import ContactCard from "../components/ContactCard.svelte";
  import StatusPill from "../components/StatusPill.svelte";
  import { bookActions, loanStatusFor, sameHash, type BookAction } from "../library/actions";
  import { describeDistance } from "../library/geo";
  import type { LibraryState } from "../library/state.svelte";
  import type { HandoffMethod } from "../library/types";

  let { lib, bookHash }: { lib: LibraryState; bookHash: ActionHash } = $props();

  let listing = $derived(lib.listing(bookHash));
  let actions = $derived(listing ? bookActions({ listing, me: lib.me, requests: lib.requestsFor(bookHash) }) : []);
  let mainActions = $derived(actions.filter((a) => a.kind !== "accept" && a.kind !== "decline"));
  let requestActions = $derived(actions.filter((a) => a.kind === "accept"));
  let isOwner = $derived(!!listing && sameHash(listing.owner, lib.me));
  let distance = $derived(listing && !isOwner ? lib.distanceTo(listing.owner) : null);

  // Inline forms instead of browser dialogs (which don't work well inside Moss).
  let confirmingDelete = $state(false);
  let disputing = $state(false);
  let leaving = $state<HandoffMethod | null>(null);
  let note = $state("");

  /** Asking and lending share your private details, so make sure they're set first. */
  function needsDetails(why: string): boolean {
    if (lib.hasLocation) return false;
    lib.go({ name: "details", reason: why });
    return true;
  }

  async function perform(action: BookAction) {
    switch (action.kind) {
      case "request":
        if (needsDetails("Add your location before asking to borrow, so the owner knows where you are.")) return;
        return lib.run(() => lib.api.requestBorrow(bookHash));
      case "cancelRequest":
        return lib.run(() => lib.api.cancelRequest(action.request.request_hash));
      case "accept":
        if (needsDetails("Add your location before lending, so the borrower knows where to pick it up.")) return;
        return lib.run(() => lib.api.acceptRequest(action.request.request_hash));
      case "decline":
        return lib.run(() => lib.api.declineRequest(action.request.request_hash));
      case "handedOver":
      case "pickedUp":
        return lib.run(() => lib.api.confirmHandover(action.loan.loan_hash));
      case "leftInBorrowersMailbox":
        leaving = "BorrowersMailbox";
        return;
      case "leftInMyMailbox":
        leaving = "OwnersMailbox";
        return;
      case "cancelLoan":
      case "markReceived":
        return lib.run(() => lib.api.confirmReceived(action.loan.loan_hash));
      case "markReturned":
        return lib.run(() => lib.api.markReturned(action.loan.loan_hash));
      case "notReceived":
        disputing = true;
        return;
      case "edit":
        return lib.go({ name: "edit", bookHash });
      case "delete":
        confirmingDelete = true;
        return;
    }
  }

  async function submitNote(e: SubmitEvent, loanHash: ActionHash) {
    e.preventDefault();
    const text = note.trim() || null;
    if (leaving) {
      const method = leaving;
      await lib.run(() => lib.api.leaveForPickup(loanHash, method, text));
    } else {
      await lib.run(() => lib.api.disputeReturn(loanHash, text));
    }
    leaving = null;
    disputing = false;
    note = "";
  }

  async function deleteBook() {
    const ok = await lib.run(() => lib.api.deleteBook(bookHash));
    if (ok) lib.go({ name: "mine" });
  }

  const LABELS: Record<BookAction["kind"], string> = {
    request: "Ask to borrow",
    cancelRequest: "Withdraw my request",
    accept: "Lend it",
    decline: "Decline",
    handedOver: "Handed over in person",
    leftInBorrowersMailbox: "Left it in their mailbox",
    leftInMyMailbox: "Left it in my mailbox",
    cancelLoan: "Cancel loan",
    pickedUp: "Picked it up",
    markReturned: "I've returned it",
    markReceived: "I got it back",
    notReceived: "Not received yet",
    edit: "Edit",
    delete: "Delete",
  };
  const PRIMARY = new Set<BookAction["kind"]>(["request", "markReturned", "markReceived", "pickedUp", "handedOver"]);
  const WHERE: Record<HandoffMethod, string> = {
    BorrowersMailbox: "in your mailbox",
    OwnersMailbox: "in the owner's mailbox",
    Other: "for you to pick up",
  };
</script>

<button class="back" onclick={() => lib.go({ name: "library" })}>← Library</button>

{#if !listing}
  <p class="muted">{lib.loading ? "Loading…" : "This book isn't on any shelf anymore."}</p>
{:else}
  {@const loan = listing.open_loan}
  {@const iBorrow = !!loan && sameHash(loan.borrower, lib.me)}
  <article class="detail">
    <BookCover book={listing.book} size="lg" />
    <div class="info">
      <h1>{listing.book.title}</h1>
      {#if listing.book.authors.length}<p class="authors">{listing.book.authors.join(", ")}</p>{/if}
      <p class="muted">
        {lib.shelfOf(listing.owner)}{distance !== null ? ` · ${describeDistance(distance)}` : ""}{listing.book.genre
          ? ` · ${listing.book.genre}`
          : ""}
      </p>
      <StatusPill status={loanStatusFor(listing, lib.me)} nameOf={lib.nameOf} />
      {#if listing.book.blurb}<p class="blurb">{listing.book.blurb}</p>{/if}
      {#if listing.book.isbn}<p class="muted small">ISBN {listing.book.isbn}</p>{/if}

      {#if loan && iBorrow && loan.status === "AwaitingHandoff"}
        <p class="callout">{lib.nameOf(loan.owner)} said yes. They'll hand it over or leave it for you to pick up.</p>
      {:else if loan && iBorrow && loan.status === "ReadyForPickup"}
        <p class="callout">
          It's {WHERE[loan.handoff_method ?? "Other"]}.{loan.last_note ? ` ${lib.nameOf(loan.owner)} says: “${loan.last_note}”` : ""}
        </p>
      {:else if loan && iBorrow && loan.status === "Active" && loan.last_event === "ReturnDispute"}
        <p class="callout">
          {lib.nameOf(loan.owner)} hasn't received it yet{loan.last_note ? `: “${loan.last_note}”` : "."}
        </p>
      {:else if loan && isOwner && loan.status === "ReturnPending"}
        <p class="callout">
          {lib.nameOf(loan.borrower)} says they've put it back in your mailbox. Have a look, then confirm.
        </p>
      {:else if loan && isOwner && loan.status === "ReadyForPickup"}
        <p class="callout">
          You left it {loan.handoff_method === "BorrowersMailbox" ? "in their mailbox" : "in your mailbox"}. Waiting for
          {lib.nameOf(loan.borrower)} to pick it up.
        </p>
      {/if}

      <div class="actions">
        {#each mainActions as action (action.kind)}
          <button
            class:primary={PRIMARY.has(action.kind)}
            class:danger={action.kind === "delete"}
            disabled={lib.busy || !!action.disabledReason}
            title={action.disabledReason}
            onclick={() => perform(action)}
          >
            {LABELS[action.kind]}
          </button>
        {/each}
        {#if lib.toPocket}
          <button title="Link this book from other Moss tools" onclick={() => lib.toPocket?.(bookHash)}>
            Add to pocket
          </button>
        {/if}
      </div>

      {#if (leaving || disputing) && loan}
        {@const other = isOwner ? lib.nameOf(loan.borrower) : lib.nameOf(loan.owner)}
        <form class="inline-form" onsubmit={(e) => submitNote(e, loan.loan_hash)}>
          <label for="note">
            {leaving ? `Anything ${other} should know? (optional)` : `Tell ${other} what's up (optional)`}
          </label>
          <textarea
            id="note"
            rows="2"
            bind:value={note}
            placeholder={leaving ? "In the blue box by the gate" : "It's not in my mailbox yet"}
          ></textarea>
          <div class="row">
            <button class="primary" disabled={lib.busy}>{leaving ? `Tell ${other}` : "Send"}</button>
            <button type="button" onclick={() => ((leaving = null), (disputing = false))}>Cancel</button>
          </div>
        </form>
      {/if}

      {#if confirmingDelete}
        <div class="inline-form">
          <p>Remove “{listing.book.title}” from your shelf?</p>
          <div class="row">
            <button class="danger" disabled={lib.busy} onclick={deleteBook}>Yes, delete it</button>
            <button onclick={() => (confirmingDelete = false)}>Keep it</button>
          </div>
        </div>
      {/if}

      {#if loan && loan.status !== "Closed"}
        {#if isOwner}
          <ContactCard {lib} contextHash={loan.request} who={lib.nameOf(loan.borrower)} />
        {:else if iBorrow}
          <ContactCard {lib} contextHash={loan.loan_hash} who={lib.nameOf(loan.owner)} />
        {/if}
      {/if}

      {#if requestActions.length}
        <h2>Requests</h2>
        <ul class="requests">
          {#each requestActions as action}
            {#if action.kind === "accept"}
              {@const d = lib.distanceTo(action.request.requester)}
              <li>
                <div>
                  <span>{lib.nameOf(action.request.requester)} would like to borrow it</span>
                  {#if d !== null}<span class="muted"> · {describeDistance(d)}</span>{/if}
                  <ContactCard {lib} contextHash={action.request.request_hash} who={lib.nameOf(action.request.requester)} />
                </div>
                <span class="row">
                  <button
                    class="primary"
                    disabled={lib.busy || !!action.disabledReason}
                    title={action.disabledReason}
                    onclick={() => perform(action)}>Lend it</button
                  >
                  <button disabled={lib.busy} onclick={() => perform({ kind: "decline", request: action.request })}
                    >Decline</button
                  >
                </span>
              </li>
            {/if}
          {/each}
        </ul>
      {/if}
    </div>
  </article>
{/if}

<style>
  .back { margin: 0.5rem 1rem; }
  .detail {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 1.5rem 2rem;
    padding: 0.5rem 1rem 2rem;
    align-items: start;
  }
  @media (max-width: 560px) {
    .detail { grid-template-columns: 1fr; justify-items: center; text-align: center; }
  }
  h1 { margin: 0 0 0.25rem; font-size: 1.8rem; }
  h2 { margin: 1.5rem 0 0.5rem; font-size: 1.1rem; }
  .authors { margin: 0 0 0.5rem; font-size: 1.1rem; }
  .blurb { max-width: 40rem; }
  .small { font-size: 0.85rem; }
  .actions, .row { display: flex; gap: 0.6rem; flex-wrap: wrap; margin-top: 1rem; }
  .row { margin-top: 0.5rem; }
  .callout {
    margin: 1rem 0 0;
    padding: 0.75rem 1rem;
    border-left: 4px solid var(--accent);
    background: var(--surface-2);
    border-radius: 4px;
  }
  .inline-form { margin-top: 1rem; max-width: 28rem; text-align: left; }
  .requests { list-style: none; padding: 0; margin: 0; }
  .requests li {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    flex-wrap: wrap;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border);
  }
  .requests .row { margin: 0; }
</style>
