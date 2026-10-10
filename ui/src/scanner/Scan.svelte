<script lang="ts">
  import { onMount } from "svelte";

  import type { LibraryState } from "../library/state.svelte";
  import { prepareImage } from "./image";
  import { findMatches } from "./lookup";
  import { scanPhotos, type PhotoFailure } from "./pipeline";
  import { checkOllama, recognize, type OllamaStatus } from "./ollama";
  import type { ScanKind } from "./recognition";
  import RecognizerSetup from "./RecognizerSetup.svelte";
  import ReviewCards from "./ReviewCards.svelte";
  import ReviewList from "./ReviewList.svelte";
  import {
    acceptAll,
    booksToAdd,
    buildSuggestions,
    counts,
    decide,
    editBook,
    undoLast,
    useCandidate,
    type Suggestion,
  } from "./review";

  let { lib }: { lib: LibraryState } = $props();

  type Step = "checking" | "setup" | "choose" | "working" | "review" | "done";
  let step = $state<Step>("checking");
  let status = $state<OllamaStatus>({ state: "unreachable" });
  let checking = $state(false);
  let model = $state("");

  let kind = $state<ScanKind>("shelf");
  let files = $state<{ file: File; url: string }[]>([]);
  let dragging = $state(false);
  let progress = $state("");
  let problem = $state<string | null>(null);
  let failures = $state<PhotoFailure[]>([]);
  let controller: AbortController | undefined;

  let suggestions = $state<Suggestion[]>([]);
  let view = $state<"list" | "cards">("list");
  let added = $state(0);
  let tally = $derived(counts(suggestions));

  const MODEL_KEY = "mailboox:vision-model";

  async function check() {
    checking = true;
    status = await checkOllama();
    checking = false;
    if (status.state !== "ready") {
      step = "setup";
      return;
    }
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(MODEL_KEY);
    } catch {
      // Storage can be unavailable; fall back to the best installed model.
    }
    const models = status.visionModels;
    model = saved && models.includes(saved) ? saved : (models.find((m) => m.startsWith("qwen2.5vl")) ?? models[0]);
    step = "choose";
  }

  function rememberModel() {
    try {
      localStorage.setItem(MODEL_KEY, model);
    } catch {
      // Not critical.
    }
  }

  onMount(check);

  function addFiles(list: FileList | null) {
    for (const file of Array.from(list ?? [])) {
      if (file.type.startsWith("image/")) files = [...files, { file, url: URL.createObjectURL(file) }];
    }
  }

  function removeFile(i: number) {
    URL.revokeObjectURL(files[i].url);
    files = files.filter((_, j) => j !== i);
  }

  /** Ollama's own errors are long and technical; keep the first line. */
  const shortError = (message: string) => message.split("\n")[0].slice(0, 200);

  async function scan() {
    step = "working";
    problem = null;
    failures = [];
    controller = new AbortController();
    let scanned;
    try {
      scanned = await scanPhotos(
        files.map((f) => f.file),
        kind,
        {
          prepare: async (file) => (await prepareImage(file, kind)).base64,
          recognize: (image, signal) => recognize(model, image, kind, { signal }),
          lookup: (detection) => findMatches(detection),
          onProgress: (p) => (progress = p),
          pause: () => new Promise((r) => setTimeout(r, 150)), // Be gentle with the free catalogues.
          signal: controller.signal,
        },
      );
    } catch (e) {
      if ((e as Error).name !== "AbortError") problem = `Couldn't read the photos: ${shortError((e as Error).message)}`;
      step = "choose";
      return;
    }
    const { results } = scanned;
    failures = scanned.failures;
    if (!results.length) {
      problem = failures.length
        ? `Couldn't read ${failures.length === 1 ? "the photo" : "any of the photos"}: ${shortError(failures[0].message)}`
        : "No titles could be read. Try a closer, well-lit photo with the spines facing the camera.";
      step = "choose";
      return;
    }
    suggestions = buildSuggestions(results, lib.myBooks.map((b) => b.book));
    view = "list";
    step = "review";
  }

  async function addToShelf(all: boolean) {
    const list = all ? acceptAll(suggestions) : suggestions;
    const books = booksToAdd(list);
    if (!books.length) return;
    const created = await lib.run(() => lib.api.createBooksBatch(books));
    if (created) {
      added = created.length;
      files.forEach((f) => URL.revokeObjectURL(f.url));
      files = [];
      step = "done";
    }
  }

  function undo(): string | null {
    const latest = suggestions.reduce<Suggestion | null>((a, s) => (s.changedAt > (a?.changedAt ?? 0) ? s : a), null);
    suggestions = undoLast(suggestions);
    return latest?.id ?? null;
  }
</script>

<header class="screen-head">
  <h1>Scan books</h1>
  {#if step === "review"}
    <div class="views" role="tablist" aria-label="How to review">
      <button role="tab" aria-selected={view === "list"} class:active={view === "list"} onclick={() => (view = "list")}>Review all</button>
      <button role="tab" aria-selected={view === "cards"} class:active={view === "cards"} onclick={() => (view = "cards")}>One at a time</button>
    </div>
  {/if}
</header>

<div class="scan">
  {#if step === "checking"}
    <p class="muted">Looking for the book reader…</p>
  {:else if step === "setup"}
    <RecognizerSetup {status} {checking} oncheck={check} />
  {:else if step === "choose"}
    {#if problem}<p class="alert">{problem}</p>{/if}

    <div class="kinds" role="radiogroup" aria-label="What's in the photo?">
      <button role="radio" aria-checked={kind === "shelf"} class:chosen={kind === "shelf"} onclick={() => (kind = "shelf")}>
        <strong>A shelf</strong><span class="muted">Spines side by side. Every readable title is suggested.</span>
      </button>
      <button role="radio" aria-checked={kind === "single"} class:chosen={kind === "single"} onclick={() => (kind = "single")}>
        <strong>One book</strong><span class="muted">A front cover or a single spine.</span>
      </button>
    </div>

    <label
      class="drop"
      class:dragging
      ondragover={(e) => { e.preventDefault(); dragging = true; }}
      ondragleave={() => (dragging = false)}
      ondrop={(e) => { e.preventDefault(); dragging = false; addFiles(e.dataTransfer?.files ?? null); }}
    >
      <input type="file" accept="image/*" multiple onchange={(e) => addFiles(e.currentTarget.files)} />
      <strong>Drop photos here</strong>
      <span class="muted">or click to choose. Phone photos work well: AirDrop or sync them to this computer first.</span>
    </label>

    {#if files.length}
      <ul class="thumbs">
        {#each files as f, i (f.url)}
          <li><img src={f.url} alt="Photo {i + 1}" /><button aria-label="Remove photo {i + 1}" onclick={() => removeFile(i)}>✕</button></li>
        {/each}
      </ul>
    {/if}

    <div class="row">
      <button class="primary" disabled={!files.length} onclick={scan}>
        Scan {files.length || ""} {files.length === 1 ? "photo" : "photos"}
      </button>
      {#if status.state === "ready" && status.visionModels.length > 1}
        <label class="model">Reader
          <select bind:value={model} onchange={rememberModel}>
            {#each status.visionModels as m}<option value={m}>{m}</option>{/each}
          </select>
        </label>
      {/if}
    </div>
    <p class="muted small">Photos are read on this computer by Ollama ({model}) and never uploaded. Titles are then looked up on Open Library.</p>
  {:else if step === "working"}
    <div class="working">
      <progress></progress>
      <p>{progress}</p>
      <p class="muted small">Shelf photos can take up to a minute on a laptop.</p>
      <button onclick={() => controller?.abort()}>Cancel</button>
    </div>
  {:else if step === "review"}
    {#if failures.length}
      <div class="alert" role="alert">
        {#each failures as f}
          <p>Couldn't read photo {f.photo}{files.length > 1 ? ` (${f.name})` : ""}: {shortError(f.message)}</p>
        {/each}
        <p class="small">The books from the other photos are below. Try that photo again, or take a closer one of part of the shelf.</p>
      </div>
    {/if}
    <p class="summary">
      Found {tally.total} {tally.total === 1 ? "book" : "books"}: <strong>{tally.add} to add</strong>{#if tally.undecided}, <strong class="look">{tally.undecided} need a look</strong>{/if}{#if tally.duplicates}, {tally.duplicates} already on your shelf{/if}.
    </p>

    {#if view === "list"}
      <ReviewList
        {suggestions}
        ondecide={(id, d) => (suggestions = decide(suggestions, id, d))}
        onedit={(id, b) => (suggestions = editBook(suggestions, id, b))}
        onpick={(id, c) => (suggestions = useCandidate(suggestions, id, c))}
      />
    {:else}
      <ReviewCards
        {suggestions}
        ondecide={(id, d) => (suggestions = decide(suggestions, id, d))}
        onedit={(id, b) => (suggestions = editBook(suggestions, id, b))}
        onpick={(id, c) => (suggestions = useCandidate(suggestions, id, c))}
        onundo={undo}
      />
    {/if}

    {#if lib.error}
      <p class="alert" role="alert">Couldn't add the books: {lib.error}</p>
    {/if}
    <footer class="commit">
      <button onclick={() => ((step = "choose"), (suggestions = []))}>Start over</button>
      <span class="spacer"></span>
      {#if tally.undecided}
        <button disabled={lib.busy} onclick={() => addToShelf(true)}>Add all {tally.add + tally.undecided}</button>
      {/if}
      <button class="primary" disabled={lib.busy || !tally.add} onclick={() => addToShelf(false)}>
        Add {tally.add} to my shelf
      </button>
    </footer>
  {:else if step === "done"}
    <div class="working">
      <h2>Added {added} {added === 1 ? "book" : "books"} to your shelf</h2>
      <div class="row">
        <button class="primary" onclick={() => lib.go({ name: "mine" })}>See my shelf</button>
        <button onclick={() => (step = "choose")}>Scan more</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .scan { display: grid; gap: 1rem; padding: 0.5rem 1rem 6rem; max-width: 46rem; }
  .views { display: flex; border: 1px solid var(--border); border-radius: 999px; overflow: hidden; }
  .views button { border: none; border-radius: 0; background: transparent; }
  .views button.active { background: var(--accent); color: var(--on-accent); font-weight: 600; }
  .kinds { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
  .kinds button { display: grid; gap: 0.25rem; text-align: left; padding: 0.9rem 1rem; border: 2px solid var(--border); border-radius: 12px; }
  .kinds button.chosen { border-color: var(--accent); background: var(--surface-2); }
  .drop {
    position: relative;
    display: grid;
    justify-items: center;
    gap: 0.25rem;
    padding: 2rem 1rem;
    border: 2px dashed var(--border);
    border-radius: 12px;
    text-align: center;
    cursor: pointer;
    font-weight: 400;
  }
  .drop.dragging { border-color: var(--accent); background: var(--surface-2); }
  .drop input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .thumbs { list-style: none; padding: 0; margin: 0; display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .thumbs li { position: relative; }
  .thumbs img { width: 96px; height: 96px; object-fit: cover; border-radius: 8px; display: block; }
  .thumbs button { position: absolute; top: 4px; right: 4px; padding: 0 0.4rem; border-radius: 999px; font-size: 0.8rem; }
  .row { display: flex; gap: 0.75rem; align-items: end; flex-wrap: wrap; }
  .model { display: grid; gap: 0.2rem; font-size: 0.85rem; }
  .model select { width: auto; }
  .small { font-size: 0.85rem; margin: 0; }
  .working { display: grid; gap: 0.75rem; justify-items: start; }
  .working progress { width: 100%; max-width: 24rem; }
  .summary { margin: 0; }
  .look { color: var(--warn-fg); }
  .commit {
    position: sticky;
    bottom: 0;
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
    padding: 0.75rem 0;
    background: var(--bg);
    border-top: 1px solid var(--border);
  }
  .spacer { flex: 1; }
  @media (max-width: 520px) { .kinds { grid-template-columns: 1fr; } }
</style>
