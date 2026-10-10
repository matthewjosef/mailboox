<script lang="ts">
  import type { ActionHash } from "@holochain/client";

  import BookCover from "../components/BookCover.svelte";
  import StatusPill from "../components/StatusPill.svelte";
  import { bookActions, loanStatusFor, type BookAction } from "../library/actions";
  import type { LibraryState } from "../library/state.svelte";

  let { lib, bookHash }: { lib: LibraryState; bookHash: ActionHash } = $props();

  let listing = $derived(lib.listing(bookHash));
  let actions = $derived(
    listing ? bookActions({ listing, me: lib.me, requests: lib.requestsFor(bookHash) }) : [],
  );
  let ownerActions = $derived(actions.filter((a) => a.kind !== "accept" && a.kind !== "decline"));
  let requestActions = $derived(actions.filter((a) => a.kind === "accept"));

  // Inline confirmations instead of browser dialogs (which don't work well inside Moss).
  let confirmingDelete = $state(false);
  let disputing = $state(false);
  let disputeNote = $state("");

  async function perform(action: BookAction) {
    switch (action.kind) {
      case "request":
        return lib.run(() => lib.api.requestBorrow(bookHash));
      case "cancelRequest":
        return lib.run(() => lib.api.cancelRequest(action.request.request_hash));
      case "accept":
        return lib.run(() => lib.api.acceptRequest(action.request.request_hash));
      case "decline":
        return lib.run(() => lib.api.declineRequest(action.request.request_hash));
      case "markReturned":
        return lib.run(() => lib.api.markReturned(action.loan.loan_hash));
      case "markReceived":
        return lib.run(() => lib.api.confirmReceived(action.loan.loan_hash));
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

  async function submitDispute(loanHash: ActionHash) {
    const note = disputeNote.trim() || null;
    await lib.run(() => lib.api.disputeReturn(loanHash, note));
    disputing = false;
    disputeNote = "";
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
    markReturned: "I've returned it",
    markReceived: "I got it back",
    notReceived: "Not received yet",
    edit: "Edit",
    delete: "Delete",
  };
</script>

<button class="back" onclick={() => lib.go({ name: "library" })}>← Library</button>

{#if !listing}
  <p class="muted">{lib.loading ? "Loading…" : "This book isn't on any shelf anymore."}</p>
{:else}
  {@const loan = listing.open_loan}
  <article class="detail">
    <BookCover book={listing.book} size="lg" />
    <div class="info">
      <h1>{listing.book.title}</h1>
      {#if listing.book.authors.length}<p class="authors">{listing.book.authors.join(", ")}</p>{/if}
      <p class="muted">{lib.shelfOf(listing.owner)}{listing.book.genre ? ` · ${listing.book.genre}` : ""}</p>
      <StatusPill status={loanStatusFor(listing, lib.me)} nameOf={lib.nameOf} />
      {#if listing.book.blurb}<p class="blurb">{listing.book.blurb}</p>{/if}
      {#if listing.book.isbn}<p class="muted small">ISBN {listing.book.isbn}</p>{/if}

      {#if loan?.status === "ReturnPending" && loan.last_event === "ReturnNotice"}
        <p class="callout">
          {lib.nameOf(loan.borrower)} says they've put it back in your mailbox. Have a look, then confirm.
        </p>
      {/if}

      <div class="actions">
        {#each ownerActions as action (action.kind)}
          <button
            class:primary={["request", "markReturned", "markReceived"].includes(action.kind)}
            class:danger={action.kind === "delete"}
            disabled={lib.busy || !!action.disabledReason}
            title={action.disabledReason}
            onclick={() => perform(action)}
          >
            {LABELS[action.kind]}
          </button>
        {/each}
      </div>

      {#if disputing && loan}
        <form class="inline-form" onsubmit={(e) => { e.preventDefault(); submitDispute(loan.loan_hash); }}>
          <label for="dispute-note">Tell {lib.nameOf(loan.borrower)} what's up (optional)</label>
          <textarea id="dispute-note" rows="2" bind:value={disputeNote} placeholder="It's not in my mailbox yet"></textarea>
          <div class="row">
            <button class="primary" disabled={lib.busy}>Send</button>
            <button type="button" onclick={() => (disputing = false)}>Cancel</button>
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

      {#if requestActions.length}
        <h2>Requests</h2>
        <ul class="requests">
          {#each requestActions as action}
            {#if action.kind === "accept"}
              <li>
                <span>{lib.nameOf(action.request.requester)} would like to borrow it</span>
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
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border);
  }
  .requests .row { margin: 0; }
</style>
