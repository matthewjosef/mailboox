<script lang="ts">
  import { backupFileName, makeBackup, parseBackup, planImport, type Backup, type ImportPlan } from "../library/backup";
  import { friendlyError } from "../library/errors";
  import type { LibraryState } from "../library/state.svelte";

  let { lib }: { lib: LibraryState } = $props();

  let includeContact = $state(false);
  let exportNote = $state<string | null>(null);
  let pasted = $state("");
  let pending = $state<{ backup: Backup; plan: ImportPlan } | null>(null);
  let importError = $state<string | null>(null);
  let imported = $state<string | null>(null);

  async function buildBackupText(): Promise<string> {
    // Ask the zome directly, so the file has every book even if the library view is still syncing.
    const books = (await lib.api.getBooksForOwner(lib.me)).map((l) => l.book);
    const backup = makeBackup(
      { books, profile: lib.myProfile, contact: includeContact ? lib.myContact : null },
      __APP_VERSION__,
    );
    return JSON.stringify(backup, null, 2);
  }

  async function download() {
    exportNote = null;
    try {
      const text = await buildBackupText();
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: backupFileName() });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      exportNote = `Saving ${backupFileName()}. If no file appears, use "Copy" instead.`;
    } catch (e) {
      exportNote = `Couldn't export: ${friendlyError(e)}`;
    }
  }

  async function copy() {
    exportNote = null;
    try {
      await navigator.clipboard.writeText(await buildBackupText());
      exportNote = "Copied. Paste it into a text file to keep it, or into another MailBoox's import box.";
    } catch (e) {
      exportNote = `Couldn't copy: ${friendlyError(e)}`;
    }
  }

  async function prepare(text: string) {
    importError = null;
    imported = null;
    pending = null;
    try {
      const backup = parseBackup(text);
      const books = (await lib.api.getBooksForOwner(lib.me)).map((l) => l.book);
      pending = { backup, plan: planImport(backup, { books, profile: lib.myProfile, contact: lib.myContact }) };
    } catch (e) {
      importError = e instanceof Error ? e.message : friendlyError(e);
    }
  }

  async function pickFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (file) await prepare(await file.text());
  }

  async function confirmImport() {
    if (!pending) return;
    const { plan } = pending;
    const ok = await lib.run(async () => {
      if (plan.toAdd.length) await lib.api.createBooksBatch(plan.toAdd.map((b) => ({ ...b, source: "Import" as const })));
      if (plan.restoreArea) await lib.api.setMyProfile({ area: plan.restoreArea });
      if (plan.restoreContact) await lib.api.setMyContactDetails(plan.restoreContact);
      return true;
    });
    if (!ok) return;
    await lib.loadMyDetails().catch(() => {});
    imported = `Added ${plan.toAdd.length} ${plan.toAdd.length === 1 ? "book" : "books"} to your shelf.`;
    pending = null;
    pasted = "";
  }
</script>

<section class="backup">
  <h2>Back up or move your shelf</h2>
  <p class="muted">
    Save your books to a file, then import them into another copy of MailBoox: after reinstalling, in a different group,
    or when a future version needs a fresh install. Loans and requests stay where they are, because they're shared with
    the other person.
  </p>

  <div class="row">
    <button onclick={download} disabled={lib.busy}>Export my shelf</button>
    <button class="link" onclick={copy} disabled={lib.busy}>Copy instead</button>
    <label class="check"><input type="checkbox" bind:checked={includeContact} /> Include my exact address</label>
  </div>
  {#if exportNote}<p class="small">{exportNote}</p>{/if}

  <h3>Import</h3>
  <div class="row">
    <label class="file">Choose a backup file<input type="file" accept=".json,application/json" onchange={pickFile} /></label>
    <span class="muted">or paste it:</span>
  </div>
  <textarea rows="2" bind:value={pasted} placeholder={'{"format": "mailboox-backup", …}'}></textarea>
  <div class="row"><button onclick={() => prepare(pasted)} disabled={!pasted.trim()}>Read pasted backup</button></div>

  {#if importError}<p class="alert" role="alert">{importError}</p>{/if}
  {#if pending}
    <div class="callout">
      <p>
        <strong>{pending.plan.toAdd.length} {pending.plan.toAdd.length === 1 ? "book" : "books"} to add</strong>{#if pending.plan.alreadyOnShelf}, {pending.plan.alreadyOnShelf} already on your shelf{/if}.
        {#if pending.plan.restoreArea}Your map area will be restored.{/if}
        {#if pending.plan.restoreContact}Your address and pickup instructions will be restored.{/if}
      </p>
      <div class="row">
        <button class="primary" onclick={confirmImport} disabled={lib.busy || (!pending.plan.toAdd.length && !pending.plan.restoreArea && !pending.plan.restoreContact)}>
          Import
        </button>
        <button class="link" onclick={() => (pending = null)}>Cancel</button>
      </div>
    </div>
  {/if}
  {#if imported}<p class="small">{imported}</p>{/if}
</section>

<style>
  .backup { display: grid; gap: 0.6rem; max-width: 40rem; padding: 0 1rem 2rem; }
  h2 { font-size: 1.1rem; margin: 0; }
  h3 { font-size: 1rem; margin: 0.5rem 0 0; }
  p { margin: 0; }
  .row { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
  .check { display: flex; gap: 0.35rem; align-items: center; }
  .file input { display: block; margin-top: 0.25rem; }
  .small { font-size: 0.9rem; }
  .callout { display: grid; gap: 0.5rem; padding: 0.75rem 1rem; border-left: 4px solid var(--accent); background: var(--surface-2); border-radius: 4px; }
</style>
