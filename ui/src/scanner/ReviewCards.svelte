<script lang="ts">
  import BookCover from "../components/BookCover.svelte";
  import type { Book } from "../library/types";
  import type { Candidate } from "./lookup";
  import { nextToReview, reviewQueue, type Decision, type Suggestion } from "./review";
  import SuggestionEditor from "./SuggestionEditor.svelte";

  let {
    suggestions,
    ondecide,
    onedit,
    onpick,
    onundo,
  }: {
    suggestions: Suggestion[];
    ondecide: (id: string, decision: Decision) => void;
    onedit: (id: string, book: Book) => void;
    onpick: (id: string, candidate: Candidate) => void;
    onundo: () => string | null;
  } = $props();

  let queue = $derived(reviewQueue(suggestions));
  let currentId = $state<string | null>(null);
  let finished = $state(false);
  let editing = $state(false);

  // Start at the first card; after deciding, move on.
  let current = $derived(finished ? null : (queue.find((s) => s.id === currentId) ?? queue[0] ?? null));
  let position = $derived(current ? queue.indexOf(current) + 1 : queue.length);

  function choose(decision: Decision) {
    if (!current) return;
    const id = current.id;
    ondecide(id, decision);
    advance(id);
  }

  function advance(fromId: string) {
    editing = false;
    const next = nextToReview(suggestions, fromId);
    if (next) currentId = next.id;
    else finished = true;
  }

  function undo() {
    const id = onundo();
    if (id) {
      currentId = id;
      finished = false;
      editing = false;
    }
  }

  function onkeydown(e: KeyboardEvent) {
    if (editing || (e.target as HTMLElement).closest("input, textarea, select")) return;
    if (e.key === "ArrowRight") choose("add");
    else if (e.key === "ArrowLeft") choose("skip");
    else if (e.key.toLowerCase() === "e" && current) editing = true;
    else if (e.key === "Backspace" || (e.key.toLowerCase() === "z" && (e.metaKey || e.ctrlKey))) undo();
    else return;
    e.preventDefault();
  }
</script>

<svelte:window {onkeydown} />

<div class="progress" aria-label="Progress">
  <div class="bar" style="width: {queue.length ? (100 * (finished ? queue.length : position - 1)) / queue.length : 100}%"></div>
</div>

{#if current}
  <article class="card" data-decision={current.decision}>
    <p class="muted step">Book {position} of {queue.length}</p>
    <div class="cover"><BookCover book={current.book} /></div>
    <h2>{current.book.title}</h2>
    <p class="authors">{current.book.authors.join(", ") || "Author unknown"}</p>
    <p class="muted small">
      {#if current.edited}
        Edited by you
      {:else if current.lookup.best}
        Matched in {current.lookup.best.candidate.source}{current.lookup.best.candidate.year ? ` (${current.lookup.best.candidate.year})` : ""}
      {:else}
        No catalogue match. Check the details before adding.
      {/if}
      {#if current.detection.title !== current.book.title}
        <br />The photo read: “{current.detection.title}”
      {/if}
    </p>

    {#if editing}
      <SuggestionEditor
        suggestion={current}
        onsave={(book) => {
          const id = current!.id;
          onedit(id, book);
          advance(id);
        }}
        onpick={(c) => {
          const id = current!.id;
          onpick(id, c);
          advance(id);
        }}
        oncancel={() => (editing = false)}
      />
    {:else}
      <div class="buttons">
        <button class="big skip" class:chosen={current.decision === "skip"} onclick={() => choose("skip")}>
          <span aria-hidden="true">✕</span> Skip
        </button>
        <button class="big" onclick={() => (editing = true)}><span aria-hidden="true">✎</span> Edit</button>
        <button class="big add primary" class:chosen={current.decision === "add"} onclick={() => choose("add")}>
          <span aria-hidden="true">✓</span> Add
        </button>
      </div>
      <p class="muted hint">Keys: ← skip · → add · E edit · Backspace undo</p>
    {/if}
  </article>
{:else}
  <article class="card done">
    <h2>That's everything</h2>
    <p class="muted">Check the total below, then add them to your shelf. You can still go back.</p>
  </article>
{/if}

<div class="nav">
  <button class="link" onclick={undo}>↶ Undo last</button>
</div>

<style>
  .progress { height: 6px; background: var(--surface-2); border-radius: 999px; overflow: hidden; margin-bottom: 1rem; }
  .bar { height: 100%; background: var(--accent); transition: width 0.2s; }
  .card {
    display: grid;
    justify-items: center;
    gap: 0.4rem;
    text-align: center;
    padding: 1.25rem 1rem;
    border: 2px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
    max-width: 30rem;
    margin: 0 auto;
  }
  .step { margin: 0; font-size: 0.85rem; }
  /* Small enough that the buttons stay on screen above the sticky footer. */
  .cover { width: min(140px, 36vw); }
  h2 { margin: 0.5rem 0 0; font-size: 1.4rem; }
  .authors { margin: 0; font-size: 1.05rem; }
  .small { font-size: 0.85rem; margin: 0.25rem 0 0; }
  .buttons { display: grid; grid-template-columns: 1fr auto 1fr; gap: 0.6rem; width: 100%; margin-top: 0.75rem; }
  .big { padding: 0.85rem 1rem; font-size: 1.05rem; border-radius: 12px; }
  .big.skip.chosen { background: var(--surface-2); font-weight: 600; }
  .big.add.chosen { outline: 3px solid var(--accent); outline-offset: 2px; }
  .hint { font-size: 0.8rem; margin: 0.25rem 0 0; }
  .nav { display: flex; justify-content: center; margin-top: 0.75rem; }
  .done { padding: 2rem 1rem; }
</style>
