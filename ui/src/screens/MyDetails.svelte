<script lang="ts">
  import { untrack } from "svelte";

  import MapPicker from "../components/MapPicker.svelte";
  import type { LibraryState } from "../library/state.svelte";
  import type { RoundedPin } from "../library/types";

  let { lib, reason }: { lib: LibraryState; reason?: string } = $props();

  // Start from what's saved when the page opens; later refreshes don't overwrite edits.
  let pin = $state<RoundedPin | null>(untrack(() => lib.myProfile?.area ?? null));
  let address = $state(untrack(() => lib.myContact?.address ?? ""));
  let instructions = $state(untrack(() => lib.myContact?.instructions ?? ""));
  let saved = $state(false);

  async function save(e: SubmitEvent) {
    e.preventDefault();
    saved = false;
    const ok = await lib.run(async () => {
      await lib.api.setMyProfile({ area: pin });
      await lib.api.setMyContactDetails({ address: address.trim(), instructions: instructions.trim() });
      return true;
    });
    if (ok) {
      await lib.loadMyDetails();
      saved = true;
    }
  }
</script>

<header class="screen-head"><h1>My details</h1></header>

<form class="details" onsubmit={save}>
  {#if reason}<p class="callout">{reason}</p>{/if}

  <section>
    <h2>Roughly where you are</h2>
    <p class="muted">
      Everyone in the group sees this as an area about 1 km across, so they know how far a book would travel.
    </p>
    <MapPicker {pin} onpick={(p) => (pin = p)} />
  </section>

  <section>
    <h2>Exact address and pickup instructions</h2>
    <p class="muted">
      Private. Only shared, encrypted, with the other person in a loan: with an owner when you ask to borrow, and
      with a borrower when you lend.
    </p>
    <label>Address <input required bind:value={address} placeholder="12 Maple St" autocomplete="street-address" /></label>
    <label
      >Mailbox or pickup instructions
      <textarea rows="2" bind:value={instructions} placeholder="Green mailbox by the gate; porch box if it's raining"
      ></textarea></label
    >
  </section>

  <div class="row">
    <button class="primary" disabled={lib.busy || !pin || !address.trim()}>Save</button>
    {#if saved}<span class="muted">Saved. Requests and loans from now on include these details.</span>{/if}
  </div>
</form>

<style>
  .details { display: grid; gap: 1.5rem; max-width: 40rem; padding: 0 1rem 2rem; }
  section { display: grid; gap: 0.6rem; }
  h2 { font-size: 1.1rem; margin: 0; }
  p { margin: 0; }
  .row { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
  .callout { padding: 0.75rem 1rem; border-left: 4px solid var(--accent); background: var(--surface-2); border-radius: 4px; }
</style>
