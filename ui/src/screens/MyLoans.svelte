<script lang="ts">
  import BookCover from "../components/BookCover.svelte";
  import { hashKey, type LibraryState } from "../library/state.svelte";
  import type { LoanView } from "../library/types";

  let { lib }: { lib: LibraryState } = $props();

  let borrowed = $derived(lib.loans.borrowed.filter((l) => l.status !== "Closed"));
  let lent = $derived(lib.loans.lent.filter((l) => l.status !== "Closed"));
  let history = $derived(
    [...lib.loans.borrowed, ...lib.loans.lent].filter((l) => l.status === "Closed"),
  );

  const statusText = (loan: LoanView, iAmBorrower: boolean) => {
    const note = loan.last_note ? ` “${loan.last_note}”` : "";
    if (loan.status === "AwaitingHandoff") {
      return iAmBorrower ? "Accepted. Waiting for the owner to hand it over." : "Hand it over, or leave it for pickup.";
    }
    if (loan.status === "ReadyForPickup") {
      const where = loan.handoff_method === "BorrowersMailbox" ? "your mailbox" : "the owner's mailbox";
      return iAmBorrower ? `Waiting in ${where}.${note}` : `Left for pickup.${note}`;
    }
    if (loan.status === "ReturnPending") {
      return iAmBorrower ? "You marked it returned. Waiting for the owner to confirm." : "Says it's back. Please confirm.";
    }
    if (loan.last_event === "ReturnDispute") {
      return iAmBorrower ? `The owner hasn't received it yet.${note}` : `You said it hasn't arrived yet.${note}`;
    }
    return iAmBorrower ? "Enjoy! Drop it back in the owner's mailbox when you're done." : "Out on loan.";
  };
</script>

<header class="screen-head"><h1>Loans</h1></header>

{#snippet row(loan: LoanView, iAmBorrower: boolean)}
  {@const listing = lib.listing(loan.book_hash)}
  <li>
    {#if listing}<BookCover book={listing.book} size="sm" />{/if}
    <div>
      <button class="link title" onclick={() => lib.go({ name: "book", bookHash: loan.book_hash })}
        >{listing?.book.title ?? "A book"}</button
      >
      <div class="muted">
        {iAmBorrower ? `From ${lib.nameOf(loan.owner)}` : `With ${lib.nameOf(loan.borrower)}`}
        · {statusText(loan, iAmBorrower)}
      </div>
    </div>
    <div class="buttons">
      {#if iAmBorrower && (loan.status === "AwaitingHandoff" || loan.status === "ReadyForPickup")}
        <button
          class:primary={loan.status === "ReadyForPickup"}
          disabled={lib.busy}
          onclick={() => lib.run(() => lib.api.confirmHandover(loan.loan_hash))}>Picked it up</button
        >
      {:else if !iAmBorrower && (loan.status === "AwaitingHandoff" || loan.status === "ReadyForPickup")}
        <button class="primary" onclick={() => lib.go({ name: "book", bookHash: loan.book_hash })}>Hand over…</button>
      {:else if iAmBorrower && loan.status === "Active"}
        <button class="primary" disabled={lib.busy} onclick={() => lib.run(() => lib.api.markReturned(loan.loan_hash))}
          >I've returned it</button
        >
      {:else if !iAmBorrower && loan.status !== "Closed"}
        <button
          class:primary={loan.status === "ReturnPending"}
          disabled={lib.busy}
          onclick={() => lib.run(() => lib.api.confirmReceived(loan.loan_hash))}>I got it back</button
        >
      {/if}
    </div>
  </li>
{/snippet}

<section>
  <h2>Books I'm borrowing</h2>
  {#if borrowed.length}
    <ul class="items">{#each borrowed as loan (hashKey(loan.loan_hash))}{@render row(loan, true)}{/each}</ul>
  {:else}<p class="muted">None right now.</p>{/if}
</section>

<section>
  <h2>Books I've lent out</h2>
  {#if lent.length}
    <ul class="items">{#each lent as loan (hashKey(loan.loan_hash))}{@render row(loan, false)}{/each}</ul>
  {:else}<p class="muted">None right now.</p>{/if}
</section>

{#if history.length}
  <section>
    <h2>Past loans</h2>
    <ul class="items">
      {#each history as loan (hashKey(loan.loan_hash))}
        {@const listing = lib.listing(loan.book_hash)}
        <li>
          {#if listing}<BookCover book={listing.book} size="sm" />{/if}
          <div>
            <strong>{listing?.book.title ?? "A book"}</strong>
            <div class="muted">{lib.nameOf(loan.owner)} → {lib.nameOf(loan.borrower)} · returned</div>
          </div>
          <div></div>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
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
  .title { font-weight: 600; }
  .buttons { display: flex; gap: 0.5rem; justify-content: flex-end; }
</style>
