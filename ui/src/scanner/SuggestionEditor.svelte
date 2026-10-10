<script lang="ts">
  import { untrack } from "svelte";

  import BookCover from "../components/BookCover.svelte";
  import type { Book } from "../library/types";
  import type { Candidate } from "./lookup";
  import { bookFromCandidate, type Suggestion } from "./review";

  let {
    suggestion,
    onsave,
    onpick,
    oncancel,
  }: {
    suggestion: Suggestion;
    onsave: (book: Book) => void;
    onpick: (candidate: Candidate) => void;
    oncancel: () => void;
  } = $props();

  const start = untrack(() => suggestion.book);
  let title = $state(start.title);
  let authors = $state(start.authors.join(", "));
  let isbn = $state(start.isbn ?? "");

  function save(e: SubmitEvent) {
    e.preventDefault();
    onsave({
      ...start,
      title: title.trim(),
      authors: authors.split(",").map((a) => a.trim()).filter(Boolean),
      isbn: isbn.trim() || null,
    });
  }

  let others = $derived(suggestion.lookup.candidates.filter((c) => c.title !== suggestion.book.title || c.isbn !== suggestion.book.isbn));
</script>

<form class="editor" onsubmit={save}>
  <label>Title <input required bind:value={title} /></label>
  <label>Author(s) <input bind:value={authors} placeholder="Separate several with commas" /></label>
  <label>ISBN <input bind:value={isbn} inputmode="numeric" placeholder="Optional; used for the cover" /></label>
  {#if suggestion.detection.title !== title}
    <p class="muted small">The photo read: “{suggestion.detection.title}”{suggestion.detection.author ? ` by ${suggestion.detection.author}` : ""}</p>
  {/if}
  <div class="row">
    <button class="primary" disabled={!title.trim()}>Save and add</button>
    <button type="button" onclick={oncancel}>Cancel</button>
  </div>

  {#if others.length}
    <fieldset>
      <legend>Or pick a catalogue match</legend>
      {#each others as candidate}
        <button type="button" class="candidate" onclick={() => onpick(candidate)}>
          <BookCover book={bookFromCandidate(candidate)} size="sm" />
          <span>
            <strong>{candidate.title}</strong>
            <span class="muted small">
              {candidate.authors.join(", ") || "Unknown author"}{candidate.year ? ` · ${candidate.year}` : ""} · {candidate.source}
            </span>
          </span>
        </button>
      {/each}
    </fieldset>
  {/if}
</form>

<style>
  .editor { display: grid; gap: 0.7rem; padding: 0.75rem 0; text-align: left; }
  .row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .small { font-size: 0.85rem; margin: 0; }
  fieldset { border: 1px solid var(--border); border-radius: 8px; padding: 0.5rem 0.75rem; display: grid; gap: 0.4rem; }
  legend { font-weight: 600; font-size: 0.9rem; padding: 0 0.25rem; }
  .candidate { display: grid; grid-template-columns: 40px 1fr; gap: 0.6rem; align-items: center; text-align: left; padding: 0.35rem; }
  .candidate :global(.cover.sm) { width: 40px; }
  .candidate span { display: grid; }
</style>
