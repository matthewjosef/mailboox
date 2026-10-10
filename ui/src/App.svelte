<script lang="ts">
  import { onMount } from "svelte";

  import { connect } from "./connect";
  import { friendlyError } from "./library/errors";
  import { LibraryClient } from "./library/libraryClient";
  import type { LibraryNotification } from "./library/notifications";
  import { LibraryState, type Route } from "./library/state.svelte";
  import BookDetail from "./screens/BookDetail.svelte";
  import BookForm from "./screens/BookForm.svelte";
  import Inbox from "./screens/Inbox.svelte";
  import Library from "./screens/Library.svelte";
  import MyBooks from "./screens/MyBooks.svelte";
  import MyDetails from "./screens/MyDetails.svelte";
  import MyLoans from "./screens/MyLoans.svelte";

  let lib = $state<LibraryState | undefined>();
  let connectError = $state<string | undefined>();
  let toasts = $state<(LibraryNotification & { id: number })[]>([]);
  let nextToast = 0;

  function showToast(notification: LibraryNotification) {
    const id = nextToast++;
    toasts = [...toasts, { ...notification, id }];
    setTimeout(() => (toasts = toasts.filter((t) => t.id !== id)), notification.urgency === "high" ? 12000 : 6000);
  }

  onMount(async () => {
    try {
      const { client, nameOf, weave } = await connect();
      // In Moss, notifications go to Moss (badges, OS notifications, linked to the book).
      const notify = weave ? weave.notify : showToast;
      const s = new LibraryState(new LibraryClient(client), nameOf, { notify });
      s.toPocket = weave?.toPocket;
      if (weave?.openBook) s.go({ name: "book", bookHash: weave.openBook });
      lib = s;
      await Promise.all([s.refresh(), s.loadMyDetails().catch((e) => console.warn("Couldn't load my details", e))]);
      s.startAutoRefresh();
      s.catchUp();
    } catch (e) {
      connectError = friendlyError(e);
    }
  });

  const tabs: { route: Route; label: string }[] = [
    { route: { name: "library" }, label: "Library" },
    { route: { name: "mine" }, label: "My shelf" },
    { route: { name: "loans" }, label: "Loans" },
    { route: { name: "inbox" }, label: "Inbox" },
    { route: { name: "details" }, label: "My details" },
  ];
</script>

{#if connectError}
  <main class="centered"><p class="alert">Couldn't connect to Holochain: {connectError}</p></main>
{:else if !lib}
  <main class="centered"><p class="muted">Opening the library…</p></main>
{:else}
  <nav class="topbar">
    <span class="brand"><img src="logo.png" alt="" />MailBoox</span>
    <div class="tabs" role="tablist">
      {#each tabs as tab}
        <button
          role="tab"
          aria-selected={lib.route.name === tab.route.name}
          class:active={lib.route.name === tab.route.name}
          onclick={() => lib?.go(tab.route)}
        >
          {tab.label}
          {#if tab.route.name === "inbox" && lib.inboxCount > 0}<span class="badge">{lib.inboxCount}</span>{/if}
        </button>
      {/each}
    </div>
  </nav>

  {#if lib.error}
    <div class="alert error" role="alert">
      {lib.error}
      <button class="link" onclick={() => lib && (lib.error = null)}>Dismiss</button>
    </div>
  {/if}

  <main>
    {#if lib.route.name === "library"}
      <Library {lib} />
    {:else if lib.route.name === "mine"}
      <MyBooks {lib} />
    {:else if lib.route.name === "book"}
      {#key lib.route.bookHash}<BookDetail {lib} bookHash={lib.route.bookHash} />{/key}
    {:else if lib.route.name === "add"}
      <BookForm {lib} />
    {:else if lib.route.name === "edit"}
      <BookForm {lib} bookHash={lib.route.bookHash} />
    {:else if lib.route.name === "inbox"}
      <Inbox {lib} />
    {:else if lib.route.name === "loans"}
      <MyLoans {lib} />
    {:else if lib.route.name === "details"}
      {#key lib.route}<MyDetails {lib} reason={lib.route.reason} />{/key}
    {/if}
  </main>
{/if}

<div class="toasts" aria-live="polite">
  {#each toasts as toast (toast.id)}
    <div class="toast" class:urgent={toast.urgency === "high"}>
      <strong>{toast.title}</strong>
      <span>{toast.body}</span>
    </div>
  {/each}
</div>

<style>
  .topbar {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
    padding: 0.5rem 1rem;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }
  .brand { display: flex; align-items: center; gap: 0.5rem; font-family: var(--font-display); font-size: 1.25rem; font-weight: 700; }
  .brand img { height: 28px; }
  .tabs { display: flex; gap: 0.25rem; overflow-x: auto; }
  .tabs button { border: none; background: transparent; padding: 0.45rem 0.8rem; border-radius: 999px; }
  .tabs button.active { background: var(--accent); color: var(--on-accent); }
  .badge {
    display: inline-block;
    min-width: 1.2em;
    margin-left: 0.3em;
    padding: 0 0.35em;
    border-radius: 999px;
    background: var(--danger);
    color: white;
    font-size: 0.75rem;
    line-height: 1.4;
  }
  main { max-width: 1100px; margin: 0 auto; }
  .centered { display: grid; place-items: center; min-height: 60vh; }
  .alert.error { margin: 0.75rem 1rem 0; display: flex; justify-content: space-between; gap: 1rem; }
  .toasts { position: fixed; right: 1rem; bottom: 1rem; display: grid; gap: 0.5rem; z-index: 10; max-width: min(24rem, calc(100vw - 2rem)); }
  .toast {
    display: grid;
    gap: 0.2rem;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.18);
  }
  .toast.urgent { border-left: 5px solid var(--accent); }
</style>
