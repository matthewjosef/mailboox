<script lang="ts">
  import type { AgentPubKey } from "@holochain/client";

  import type { LoanStatusView } from "../library/actions";

  let { status, nameOf }: { status: LoanStatusView; nameOf: (a: AgentPubKey) => string } = $props();
</script>

{#if status.kind === "available"}
  <span class="pill available">Available</span>
{:else if status.kind === "onLoan"}
  <span class="pill out">On loan</span>
{:else if status.kind === "borrowedByMe"}
  <span class="pill mine">You're borrowing this</span>
{:else if status.kind === "iMarkedReturned"}
  <span class="pill pending">Returned, waiting for owner</span>
{:else if status.kind === "lentOut"}
  <span class="pill out">Lent to {nameOf(status.borrower)}</span>
{:else if status.kind === "returnClaimed"}
  <span class="pill attention">{nameOf(status.borrower)} says it's back</span>
{/if}

<style>
  .pill {
    display: inline-block;
    padding: 0.15em 0.6em;
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .available { background: var(--ok-bg); color: var(--ok-fg); }
  .out { background: var(--surface-2); color: var(--muted); }
  .mine { background: var(--info-bg); color: var(--info-fg); }
  .pending { background: var(--warn-bg); color: var(--warn-fg); }
  .attention { background: var(--accent); color: var(--on-accent); }
</style>
