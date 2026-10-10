<script lang="ts">
  import BookGrid from "../components/BookGrid.svelte";
  import { DEMO_BOOKS } from "../library/demo";
  import type { LibraryState } from "../library/state.svelte";

  let { lib }: { lib: LibraryState } = $props();

  let query = $state("");
  let filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return lib.books;
    return lib.books.filter(
      (b) => b.book.title.toLowerCase().includes(q) || b.book.authors.some((a) => a.toLowerCase().includes(q)),
    );
  });
</script>

<header class="screen-head">
  <h1>The neighbourhood library</h1>
  <input class="search" type="search" placeholder="Search titles and authors" bind:value={query} />
</header>

{#if lib.loading}
  <p class="muted">Looking along the shelves…</p>
{:else if lib.books.length === 0}
  <div class="empty">
    <p>No books here yet. Add the ones on your shelf so neighbours can borrow them.</p>
    <div class="row">
      <button class="primary" onclick={() => lib.go({ name: "add" })}>Add a book</button>
      <button disabled={lib.busy} onclick={() => lib.run(() => lib.api.createBooksBatch(DEMO_BOOKS))}>
        Add the sample shelf
      </button>
    </div>
  </div>
{:else if filtered.length === 0}
  <p class="muted">No books match “{query}”.</p>
{:else}
  <BookGrid books={filtered} {lib} />
{/if}

<style>
  .search { max-width: 22rem; }
  .empty { padding: 2rem 1rem; }
  .row { display: flex; gap: 0.75rem; flex-wrap: wrap; }
</style>
