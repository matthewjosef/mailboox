<script lang="ts">
  import type { ActionHash } from "@holochain/client";
  import { untrack } from "svelte";

  import type { LibraryState } from "../library/state.svelte";
  import { emptyBook, type Book } from "../library/types";

  let { lib, bookHash }: { lib: LibraryState; bookHash?: ActionHash } = $props();

  // The form starts from the book as it was when opened; later refreshes don't overwrite edits.
  const start: Book = untrack(() => (bookHash ? lib.listing(bookHash)?.book : undefined) ?? emptyBook());

  let title = $state(start.title);
  let authors = $state(start.authors.join(", "));
  let isbn = $state(start.isbn ?? "");
  let genre = $state(start.genre ?? "");
  let blurb = $state(start.blurb ?? "");
  let coverUrl = $state(start.cover_url ?? "");

  const orNull = (s: string) => (s.trim() ? s.trim() : null);

  async function save(e: SubmitEvent) {
    e.preventDefault();
    const book: Book = {
      ...start,
      title: title.trim(),
      authors: authors.split(",").map((a) => a.trim()).filter(Boolean),
      isbn: orNull(isbn),
      genre: orNull(genre),
      blurb: orNull(blurb),
      cover_url: orNull(coverUrl),
    };
    const saved = await lib.run(() =>
      bookHash ? lib.api.updateBook(bookHash, book) : lib.api.createBook(book),
    );
    if (saved) lib.go({ name: "book", bookHash: saved.book_hash });
  }
</script>

<header class="screen-head">
  <h1>{bookHash ? "Edit book" : "Add a book"}</h1>
  {#if !bookHash}<button class="link" onclick={() => lib.go({ name: "scan" })}>Or scan it with your camera</button>{/if}
</header>

<form class="book-form" onsubmit={save}>
  <label>Title <input required bind:value={title} /></label>
  <label>Author(s) <input bind:value={authors} placeholder="Separate several with commas" /></label>
  <div class="two">
    <label>ISBN <input bind:value={isbn} inputmode="numeric" /></label>
    <label>Genre <input bind:value={genre} /></label>
  </div>
  <label>About this book <textarea rows="3" bind:value={blurb}></textarea></label>
  <label>Cover image URL <input type="url" bind:value={coverUrl} placeholder="Leave blank to use the ISBN cover" /></label>
  <div class="row">
    <button class="primary" disabled={lib.busy || !title.trim()}>{bookHash ? "Save changes" : "Add to my shelf"}</button>
    <button
      type="button"
      onclick={() => lib.go(bookHash ? { name: "book", bookHash } : { name: "mine" })}>Cancel</button
    >
  </div>
</form>

<style>
  .book-form { display: grid; gap: 0.9rem; max-width: 34rem; padding: 0 1rem 2rem; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem; }
  @media (max-width: 480px) { .two { grid-template-columns: 1fr; } }
  .row { display: flex; gap: 0.6rem; flex-wrap: wrap; }
</style>
