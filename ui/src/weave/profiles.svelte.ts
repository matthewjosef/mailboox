import { encodeHashToBase64, type AgentPubKey } from "@holochain/client";
import type { ProfilesClient } from "@holochain-open-dev/profiles";
import { SvelteMap } from "svelte/reactivity";

import { shortName } from "../connect";

/** Moss group nicknames, fetched on demand and cached. `nameOf` stays synchronous for templates. */
export class ProfileNames {
  private names = new SvelteMap<string, string>();
  private requested = new Set<string>();

  constructor(
    private profiles: ProfilesClient,
    private me: AgentPubKey,
  ) {}

  nameOf = (agent: AgentPubKey): string => {
    const key = encodeHashToBase64(agent);
    if (key === encodeHashToBase64(this.me)) return "You";
    const known = this.names.get(key);
    if (known) return known;
    if (!this.requested.has(key)) {
      this.requested.add(key);
      this.profiles
        .getAgentProfile(agent)
        .then((record) => {
          if (record) this.names.set(key, record.entry.nickname);
        })
        .catch((e) => console.warn("Couldn't load profile", e));
    }
    return shortName(agent, this.me);
  };
}
