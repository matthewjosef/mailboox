<script lang="ts">
  import { coverSrc } from "../library/demo";
  import type { Book } from "../library/types";

  let { book, size = "md" }: { book: Book; size?: "sm" | "md" | "lg" } = $props();

  let failed = $state(false);
  let src = $derived(failed ? null : coverSrc(book));

  // A stable colour per title for the placeholder spine.
  let hue = $derived([...book.title].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7));
</script>

{#if src}
  <img class="cover {size}" {src} alt="Cover of {book.title}" loading="lazy" onerror={() => (failed = true)} />
{:else}
  <div class="cover placeholder {size}" style="--hue: {hue}" aria-label="Cover of {book.title}">
    <span class="title">{book.title}</span>
    {#if book.authors.length}<span class="author">{book.authors.join(", ")}</span>{/if}
  </div>
{/if}

<style>
  .cover {
    display: block;
    aspect-ratio: 2 / 3;
    border-radius: 3px 6px 6px 3px;
    box-shadow: var(--shadow-book);
    object-fit: cover;
    background: var(--surface-2);
  }
  .sm { width: 56px; }
  .md { width: 100%; }
  .lg { width: min(220px, 60vw); }
  .placeholder {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.5em;
    padding: 0.75em;
    box-sizing: border-box;
    color: #fffbe9;
    background: linear-gradient(90deg, hsl(var(--hue) 45% 28%) 0 8%, hsl(var(--hue) 45% 38%) 8%);
    text-align: center;
    overflow: hidden;
  }
  .placeholder .title { font-family: var(--font-display); font-weight: 600; line-height: 1.2; }
  .placeholder .author { font-size: 0.8em; opacity: 0.85; }
  .sm.placeholder { padding: 0.25em; font-size: 0.55em; }
</style>
