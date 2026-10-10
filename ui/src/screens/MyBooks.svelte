<script lang="ts">
  import BookGrid from "../components/BookGrid.svelte";
  import type { LibraryState } from "../library/state.svelte";

  let { lib }: { lib: LibraryState } = $props();
</script>

<header class="screen-head">
  <h1>My shelf</h1>
  <button class="primary" onclick={() => lib.go({ name: "add" })}>Add a book</button>
</header>

{#if lib.myBooks.length === 0}
  <p class="muted empty">You haven't added any books yet.</p>
{:else}
  <BookGrid books={lib.myBooks} {lib} showOwner={false} />
{/if}

<style>
  .empty { padding: 1rem; }
</style>
