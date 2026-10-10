<script lang="ts">
  import BookGrid from "../components/BookGrid.svelte";
  import { DEMO_BOOKS } from "../library/demo";
  import { sameHash } from "../library/actions";
  import type { LibraryState } from "../library/state.svelte";

  let { lib }: { lib: LibraryState } = $props();

  let query = $state("");
  let sort = $state<"title" | "nearest">("title");
  let filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? lib.books.filter(
          (b) => b.book.title.toLowerCase().includes(q) || b.book.authors.some((a) => a.toLowerCase().includes(q)),
        )
      : lib.books;
    if (sort === "title") return matches;
    // Unknown distances (no pin) go last; your own books count as nearest.
    const dist = (b: (typeof matches)[number]) =>
      sameHash(b.owner, lib.me) ? 0 : (lib.distanceTo(b.owner) ?? Number.POSITIVE_INFINITY);
    return [...matches].sort((a, b) => dist(a) - dist(b));
  });
</script>

<header class="screen-head">
  <h1>The neighbourhood library</h1>
  <div class="controls">
    <input class="search" type="search" placeholder="Search titles and authors" bind:value={query} />
    <select bind:value={sort} aria-label="Sort books" disabled={!lib.myProfile?.area} title={lib.myProfile?.area ? "" : "Set your location to sort by distance"}>
      <option value="title">A–Z</option>
      <option value="nearest">Nearest first</option>
    </select>
  </div>
</header>

{#if !lib.hasLocation && !lib.loading}
  <p class="nudge">
    <button class="link" onclick={() => lib.go({ name: "details" })}>Add your location</button> so neighbours can see
    how far away your books are, and so you can borrow and lend.
  </p>
{/if}

{#if lib.loading}
  <p class="muted">Looking along the shelves…</p>
{:else if lib.books.length === 0}
  <div class="empty">
    <p>No books here yet. Add the ones on your shelf so neighbours can borrow them.</p>
    <div class="row">
      <button class="primary" onclick={() => lib.go({ name: "scan" })}>Scan your shelf</button>
      <button onclick={() => lib.go({ name: "add" })}>Add a book by hand</button>
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
  .controls { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .search { max-width: 22rem; }
  select { width: auto; }
  .nudge { margin: 0.75rem 1rem 0; padding: 0.6rem 0.9rem; background: var(--surface-2); border-radius: 8px; }
  .empty { padding: 2rem 1rem; }
  .row { display: flex; gap: 0.75rem; flex-wrap: wrap; }
</style>
