<script lang="ts">
  import type { Detection } from "./recognition";

  let { onadd }: { onadd: (detection: Detection) => Promise<void> } = $props();

  let title = $state("");
  let author = $state("");
  let looking = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    looking = true;
    try {
      await onadd({ title: title.trim(), author: author.trim() || null, confidence: 1 });
      title = "";
      author = "";
    } finally {
      looking = false;
    }
  }
</script>

<form class="missed" onsubmit={submit}>
  <strong>Add a book it missed</strong>
  <input bind:value={title} placeholder="Title" aria-label="Title" />
  <input bind:value={author} placeholder="Author (optional)" aria-label="Author" />
  <button disabled={looking || !title.trim()}>{looking ? "Looking it up…" : "Add"}</button>
</form>

<style>
  .missed { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin-top: 1rem; padding: 0.75rem 1rem; border: 1px dashed var(--border); border-radius: 8px; }
  .missed input { flex: 1 1 10rem; }
</style>
