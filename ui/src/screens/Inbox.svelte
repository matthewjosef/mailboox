<script lang="ts">
  import type { ActionHash } from "@holochain/client";

  import BookCover from "../components/BookCover.svelte";
  import { hashKey, type LibraryState } from "../library/state.svelte";

  let { lib }: { lib: LibraryState } = $props();

  let returns = $derived(lib.loans.lent.filter((l) => l.status === "ReturnPending"));
  let toHandOver = $derived(lib.loans.lent.filter((l) => l.status === "AwaitingHandoff"));
  let toPickUp = $derived(lib.loans.borrowed.filter((l) => l.status === "ReadyForPickup"));
  let disputingLoan = $state<string | null>(null);
  let note = $state("");

  async function dispute(loanHash: ActionHash) {
    await lib.run(() => lib.api.disputeReturn(loanHash, note.trim() || null));
    disputingLoan = null;
    note = "";
  }
</script>

<header class="screen-head"><h1>Inbox</h1></header>

{#if toPickUp.length}
  <section>
    <h2>Ready for you to pick up</h2>
    <ul class="items">
      {#each toPickUp as loan (hashKey(loan.loan_hash))}
        {@const listing = lib.listing(loan.book_hash)}
        <li>
          {#if listing}<BookCover book={listing.book} size="sm" />{/if}
          <div class="text">
            <button class="link" onclick={() => lib.go({ name: "book", bookHash: loan.book_hash })}
              >{listing?.book.title ?? "A book"}</button
            >
            is {loan.handoff_method === "BorrowersMailbox" ? "in your mailbox" : `in ${lib.nameOf(loan.owner)}'s mailbox`}.
            {#if loan.last_note}<span class="muted">“{loan.last_note}”</span>{/if}
          </div>
          <div class="buttons">
            <button class="primary" disabled={lib.busy} onclick={() => lib.run(() => lib.api.confirmHandover(loan.loan_hash))}
              >Picked it up</button
            >
          </div>
        </li>
      {/each}
    </ul>
  </section>
{/if}

{#if toHandOver.length}
  <section>
    <h2>To hand over</h2>
    <ul class="items">
      {#each toHandOver as loan (hashKey(loan.loan_hash))}
        {@const listing = lib.listing(loan.book_hash)}
        <li>
          {#if listing}<BookCover book={listing.book} size="sm" />{/if}
          <div class="text">
            You agreed to lend <strong>{listing?.book.title ?? "a book"}</strong> to {lib.nameOf(loan.borrower)}.
          </div>
          <div class="buttons">
            <button class="primary" onclick={() => lib.go({ name: "book", bookHash: loan.book_hash })}>Hand over…</button>
          </div>
        </li>
      {/each}
    </ul>
  </section>
{/if}

{#if returns.length === 0 && toPickUp.length === 0 && toHandOver.length === 0 && lib.incomingRequests.length === 0 && lib.myRequests.length === 0}
  <p class="muted pad">Nothing needs your attention.</p>
{/if}

{#if returns.length}
  <section>
    <h2>Check your mailbox</h2>
    <ul class="items">
      {#each returns as loan (hashKey(loan.loan_hash))}
        {@const listing = lib.listing(loan.book_hash)}
        <li>
          {#if listing}<BookCover book={listing.book} size="sm" />{/if}
          <div class="text">
            <strong>{lib.nameOf(loan.borrower)}</strong> says they've returned
            <button class="link" onclick={() => lib.go({ name: "book", bookHash: loan.book_hash })}
              >{listing?.book.title ?? "a book"}</button
            >.
            {#if disputingLoan === hashKey(loan.loan_hash)}
              <form class="note" onsubmit={(e) => { e.preventDefault(); dispute(loan.loan_hash); }}>
                <input bind:value={note} placeholder="Optional note, e.g. “Not in the box yet”" />
                <button class="primary" disabled={lib.busy}>Send</button>
                <button type="button" onclick={() => (disputingLoan = null)}>Cancel</button>
              </form>
            {/if}
          </div>
          <div class="buttons">
            <button class="primary" disabled={lib.busy} onclick={() => lib.run(() => lib.api.confirmReceived(loan.loan_hash))}
              >I got it back</button
            >
            <button disabled={lib.busy} onclick={() => (disputingLoan = hashKey(loan.loan_hash))}>Not received yet</button>
          </div>
        </li>
      {/each}
    </ul>
  </section>
{/if}

{#if lib.incomingRequests.length}
  <section>
    <h2>Borrow requests</h2>
    <ul class="items">
      {#each lib.incomingRequests as request (hashKey(request.request_hash))}
        {@const listing = lib.listing(request.book_hash)}
        <li>
          {#if listing}<BookCover book={listing.book} size="sm" />{/if}
          <div class="text">
            <strong>{lib.nameOf(request.requester)}</strong> would like to borrow
            <button class="link" onclick={() => lib.go({ name: "book", bookHash: request.book_hash })}
              >{listing?.book.title ?? "a book"}</button
            >.
            {#if listing?.open_loan}<span class="muted"> It's on loan right now.</span>{/if}
          </div>
          <div class="buttons">
            <button
              class="primary"
              disabled={lib.busy || !!listing?.open_loan}
              onclick={() => lib.run(() => lib.api.acceptRequest(request.request_hash))}>Lend it</button
            >
            <button disabled={lib.busy} onclick={() => lib.run(() => lib.api.declineRequest(request.request_hash))}
              >Decline</button
            >
          </div>
        </li>
      {/each}
    </ul>
  </section>
{/if}

{#if lib.myRequests.length}
  <section>
    <h2>Waiting to hear back</h2>
    <ul class="items">
      {#each lib.myRequests as request (hashKey(request.request_hash))}
        {@const listing = lib.listing(request.book_hash)}
        <li>
          {#if listing}<BookCover book={listing.book} size="sm" />{/if}
          <div class="text">
            You asked to borrow
            <button class="link" onclick={() => lib.go({ name: "book", bookHash: request.book_hash })}
              >{listing?.book.title ?? "a book"}</button
            >{listing ? ` from ${lib.nameOf(listing.owner)}` : ""}.
          </div>
          <div class="buttons">
            <button disabled={lib.busy} onclick={() => lib.run(() => lib.api.cancelRequest(request.request_hash))}
              >Withdraw</button
            >
          </div>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .pad { padding: 0 1rem; }
  section { padding: 0 1rem 1rem; }
  h2 { font-size: 1.1rem; margin: 1rem 0 0.5rem; }
  .items { list-style: none; margin: 0; padding: 0; }
  .items li {
    display: grid;
    grid-template-columns: 56px 1fr auto;
    gap: 1rem;
    align-items: center;
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--border);
  }
  @media (max-width: 560px) {
    .items li { grid-template-columns: 56px 1fr; }
    .buttons { grid-column: 1 / -1; }
  }
  .buttons { display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: flex-end; }
  .note { display: flex; gap: 0.5rem; margin-top: 0.5rem; flex-wrap: wrap; }
  .note input { flex: 1; min-width: 12rem; }
</style>
