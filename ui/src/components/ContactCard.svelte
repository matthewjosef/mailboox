<script lang="ts">
  import type { ActionHash } from "@holochain/client";

  import type { LibraryState } from "../library/state.svelte";
  import type { ContactDetails } from "../library/types";

  /** The other party's private details for a request or loan, decrypted on this device. */
  let { lib, contextHash, who }: { lib: LibraryState; contextHash: ActionHash; who: string } = $props();

  let details = $state<ContactDetails | null | undefined>(undefined);

  $effect(() => {
    const hash = contextHash;
    details = undefined;
    lib.api
      .getSharedDetails(hash)
      .then((d) => (details = d))
      .catch(() => (details = null));
  });
</script>

<div class="card">
  <h3>{who}'s address</h3>
  {#if details === undefined}
    <p class="muted">Loading…</p>
  {:else if details}
    <p class="address">{details.address}</p>
    {#if details.instructions}<p>{details.instructions}</p>{/if}
    <p class="muted small">Only you can see this.</p>
  {:else}
    <p class="muted">{who} hasn't shared their address yet.</p>
  {/if}
</div>

<style>
  .card { margin-top: 1rem; padding: 0.75rem 1rem; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); max-width: 28rem; text-align: left; }
  h3 { margin: 0 0 0.25rem; font-size: 1rem; }
  p { margin: 0.15rem 0; }
  .address { font-weight: 600; }
  .small { font-size: 0.8rem; }
</style>
