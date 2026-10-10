<script lang="ts">
  import type { OllamaStatus } from "./ollama";

  let { status, checking, oncheck }: { status: OllamaStatus; checking: boolean; oncheck: () => void } = $props();

  const isMac = navigator.userAgent.includes("Mac");
  const isWindows = navigator.userAgent.includes("Windows");
  const originsCommand = isMac
    ? 'launchctl setenv OLLAMA_ORIGINS "applet://*"'
    : isWindows
      ? 'setx OLLAMA_ORIGINS "applet://*"'
      : "sudo systemctl edit ollama   # add: Environment=\"OLLAMA_ORIGINS=applet://*\"";

  let copied = $state<string | null>(null);
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = text;
      setTimeout(() => (copied = null), 2000);
    } catch {
      // Clipboard can be blocked in embedded frames; the text is selectable anyway.
    }
  }
</script>

<section class="setup">
  <h2>Set up the book reader</h2>
  <p>
    MailBoox reads photos with a vision model that runs <strong>on your own computer</strong>, using the free
    <a href="https://ollama.com" target="_blank" rel="noreferrer">Ollama</a> app. Your photos never leave this device.
  </p>

  {#if status.state === "unreachable"}
    <ol>
      <li>
        <strong>Install Ollama</strong> from <a href="https://ollama.com/download" target="_blank" rel="noreferrer">ollama.com/download</a>
        and open it.
      </li>
      <li>
        <strong>Let Moss tools talk to it.</strong> Run this once in a terminal, then quit and reopen Ollama:
        <div class="cmd">
          <code>{originsCommand}</code>
          <button onclick={() => copy(originsCommand)}>{copied === originsCommand ? "Copied" : "Copy"}</button>
        </div>
        <span class="muted small">On a Mac this lasts until you restart; see the Ollama FAQ for a permanent setting.</span>
      </li>
      <li>
        <strong>Download the reading model</strong> (about 6 GB):
        <div class="cmd">
          <code>ollama pull qwen2.5vl:7b</code>
          <button onclick={() => copy("ollama pull qwen2.5vl:7b")}>{copied === "ollama pull qwen2.5vl:7b" ? "Copied" : "Copy"}</button>
        </div>
      </li>
    </ol>
  {:else if status.state === "noVisionModel"}
    <p>Ollama is running, but none of your models can read images. Download one (about 6 GB):</p>
    <div class="cmd">
      <code>ollama pull qwen2.5vl:7b</code>
      <button onclick={() => copy("ollama pull qwen2.5vl:7b")}>{copied ? "Copied" : "Copy"}</button>
    </div>
  {/if}

  <button class="primary" disabled={checking} onclick={oncheck}>{checking ? "Checking…" : "Check again"}</button>
</section>

<style>
  .setup { display: grid; gap: 0.75rem; max-width: 40rem; }
  h2 { margin: 0; font-size: 1.2rem; }
  ol { display: grid; gap: 0.9rem; padding-left: 1.2rem; margin: 0; }
  .cmd { display: flex; gap: 0.5rem; align-items: center; margin: 0.35rem 0; flex-wrap: wrap; }
  code { padding: 0.35rem 0.6rem; background: var(--surface-2); border-radius: 6px; user-select: all; overflow-wrap: anywhere; }
  .small { font-size: 0.85rem; }
  .setup > button { justify-self: start; }
</style>
