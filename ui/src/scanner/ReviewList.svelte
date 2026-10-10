<script lang="ts">
  import BookCover from "../components/BookCover.svelte";
  import type { Book } from "../library/types";
  import type { Candidate } from "./lookup";
  import { type Decision, type Suggestion } from "./review";
  import SuggestionEditor from "./SuggestionEditor.svelte";

  let {
    suggestions,
    ondecide,
    onedit,
    onpick,
  }: {
    suggestions: Suggestion[];
    ondecide: (id: string, decision: Decision) => void;
    onedit: (id: string, book: Book) => void;
    onpick: (id: string, candidate: Candidate) => void;
  } = $props();

  let editing = $state<string | null>(null);
  let main = $derived(suggestions.filter((s) => s.reason !== "duplicate" && s.reason !== "repeat"));
  let setAside = $derived(suggestions.filter((s) => s.reason === "duplicate" || s.reason === "repeat"));
</script>

{#snippet row(s: Suggestion)}
  <li class="row" data-decision={s.decision}>
    <button class="cover-button" aria-label="Edit {s.book.title}" onclick={() => (editing = editing === s.id ? null : s.id)}>
      <BookCover book={s.book} size="sm" />
    </button>
    <div class="info">
      <button class="title" onclick={() => (editing = editing === s.id ? null : s.id)}>{s.book.title}</button>
      <span class="muted small">
        {s.book.authors.join(", ") || "Author unknown"}
        {#if s.lookup.best && !s.edited} · {s.lookup.best.candidate.source}{s.lookup.best.candidate.year ? ` ${s.lookup.best.candidate.year}` : ""}{/if}
      </span>
      <span class="tags">
        {#if s.decision === "undecided"}<span class="tag look">Needs a look</span>{/if}
        {#if !s.lookup.best && !s.edited}<span class="tag">No catalogue match</span>{/if}
        {#if s.edited}<span class="tag">Edited</span>{/if}
        {#if s.reason === "duplicate"}<span class="tag">Already on your shelf</span>{/if}
        {#if s.reason === "repeat"}<span class="tag">Already in this scan</span>{/if}
        {#if editing !== s.id}<button class="link small" onclick={() => (editing = s.id)}>Edit</button>{/if}
      </span>
    </div>
    <div class="choice" role="group" aria-label="Add {s.book.title} to your shelf?">
      <button class="skip" aria-pressed={s.decision === "skip"} onclick={() => ondecide(s.id, "skip")}>Skip</button>
      <button class="add" aria-pressed={s.decision === "add"} onclick={() => ondecide(s.id, "add")}>✓ Add</button>
    </div>
    {#if editing === s.id}
      <div class="edit">
        <SuggestionEditor
          suggestion={s}
          onsave={(book) => ((editing = null), onedit(s.id, book))}
          onpick={(c) => ((editing = null), onpick(s.id, c))}
          oncancel={() => (editing = null)}
        />
      </div>
    {/if}
  </li>
{/snippet}

<ul class="list">
  {#each main as s (s.id)}{@render row(s)}{/each}
</ul>

{#if setAside.length}
  <details class="aside">
    <summary>Set aside: {setAside.length} already on your shelf or repeated</summary>
    <ul class="list">
      {#each setAside as s (s.id)}{@render row(s)}{/each}
    </ul>
  </details>
{/if}

<style>
  .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
  .row {
    display: grid;
    grid-template-columns: 48px 1fr auto;
    gap: 0.75rem;
    align-items: center;
    padding: 0.6rem 0.75rem;
    border: 2px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    transition: opacity 0.15s, border-color 0.15s;
  }
  .row[data-decision="add"] { border-color: var(--accent); }
  .row[data-decision="skip"] { opacity: 0.55; }
  .row[data-decision="skip"] .title { text-decoration: line-through; text-decoration-thickness: 1px; }
  .row[data-decision="undecided"] { border-style: dashed; border-color: var(--warn-fg); }
  .cover-button { all: unset; cursor: pointer; }
  .cover-button :global(.cover.sm) { width: 48px; }
  .info { display: grid; gap: 0.15rem; min-width: 0; }
  .title { all: unset; cursor: pointer; font-weight: 600; overflow-wrap: anywhere; }
  .small { font-size: 0.85rem; }
  .tags { display: flex; gap: 0.35rem; flex-wrap: wrap; align-items: center; }
  .tag { font-size: 0.75rem; padding: 0.05rem 0.5rem; border-radius: 999px; background: var(--surface-2); color: var(--muted); }
  .tag.look { background: var(--warn-bg); color: var(--warn-fg); font-weight: 600; }
  .choice { display: flex; border: 1px solid var(--border); border-radius: 999px; overflow: hidden; }
  .choice button { border: none; border-radius: 0; padding: 0.5rem 0.9rem; min-width: 4.5rem; background: transparent; }
  .choice .skip[aria-pressed="true"] { background: var(--surface-2); font-weight: 600; }
  .choice .add[aria-pressed="true"] { background: var(--accent); color: var(--on-accent); font-weight: 600; }
  .edit { grid-column: 1 / -1; border-top: 1px solid var(--border); }
  .aside { margin-top: 1rem; }
  .aside summary { cursor: pointer; color: var(--muted); margin-bottom: 0.5rem; }
  @media (max-width: 520px) {
    .row { grid-template-columns: 48px 1fr; }
    .choice { grid-column: 1 / -1; justify-self: stretch; }
    .choice button { flex: 1; padding: 0.65rem; }
  }
</style>
