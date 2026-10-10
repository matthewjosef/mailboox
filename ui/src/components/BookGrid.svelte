<script lang="ts">
  import { loanStatusFor } from "../library/actions";
  import { hashKey, type LibraryState } from "../library/state.svelte";
  import type { BookListing } from "../library/types";
  import BookCover from "./BookCover.svelte";
  import StatusPill from "./StatusPill.svelte";

  let { books, lib, showOwner = true }: { books: BookListing[]; lib: LibraryState; showOwner?: boolean } =
    $props();
</script>

<ul class="shelf">
  {#each books as listing (hashKey(listing.book_hash))}
    <li>
      <button class="book" onclick={() => lib.go({ name: "book", bookHash: listing.book_hash })}>
        <BookCover book={listing.book} />
        <span class="title">{listing.book.title}</span>
        {#if listing.book.authors.length}
          <span class="authors">{listing.book.authors.join(", ")}</span>
        {/if}
        {#if showOwner}<span class="owner">{lib.shelfOf(listing.owner)}</span>{/if}
        <StatusPill status={loanStatusFor(listing, lib.me)} nameOf={lib.nameOf} />
      </button>
    </li>
  {/each}
</ul>

<style>
  .shelf {
    list-style: none;
    margin: 0;
    padding: 1.25rem 1rem 0.5rem;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
    gap: 1.75rem 1.25rem;
    background-image: var(--shelf-lines);
    background-size: 100% var(--shelf-row, 330px);
  }
  .book {
    all: unset;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    width: 100%;
    cursor: pointer;
    border-radius: 6px;
    padding: 0.25rem;
  }
  .book:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
  .book:hover :global(.cover) { transform: translateY(-3px) rotate(-0.5deg); }
  .book :global(.cover) { transition: transform 0.15s ease; }
  .title { font-weight: 600; line-height: 1.25; margin-top: 0.35rem; }
  .authors, .owner { font-size: 0.85rem; color: var(--muted); }
</style>
