import {
  AdminWebsocket,
  AppWebsocket,
  CellType,
  encodeHashToBase64,
  type ActionHash,
  type AgentPubKey,
  type AppClient,
} from "@holochain/client";
import { initializeHotReload, isWeaveContext, WeaveClient, type FrameNotification } from "@theweave/api";

import { sameHash } from "./library/actions";
import type { LibraryNotification } from "./library/notifications";

export interface Connection {
  client: AppClient;
  nameOf: (agent: AgentPubKey) => string;
  /** Present when running as a Moss Tool. */
  weave?: {
    client: WeaveClient;
    /** A book to open straight away (from a Weave link or asset view). */
    openBook?: ActionHash;
    notify: (notification: LibraryNotification, about?: ActionHash, from?: AgentPubKey) => void;
    /** Put a book in the Moss pocket so it can be linked from other Tools. */
    toPocket: (bookHash: ActionHash) => Promise<void>;
  };
}

/** Connect inside Moss if we're a Tool there, otherwise straight to Holochain. */
export async function connect(): Promise<Connection> {
  return isWeaveContext() ? connectWeave() : connectStandalone();
}

async function connectWeave(): Promise<Connection> {
  if (import.meta.env.DEV) {
    try {
      await initializeHotReload();
    } catch (e) {
      console.warn("Hot reload only works in Weave dev mode", e);
    }
  }
  const { createAppletServices, libraryDnaHash } = await import("./weave/appletServices");
  const { ProfileNames } = await import("./weave/profiles.svelte");

  const weaveClient = await WeaveClient.connect(createAppletServices());
  const info = weaveClient.renderInfo;
  if (info.type !== "applet-view") throw new Error("MailBoox runs inside a group, not across groups");

  const client = info.appletClient;
  const dnaHash = await libraryDnaHash(client);
  const view = info.view;
  const openBook = view.type === "asset" || view.type === "main" ? view.wal?.hrl[1] : undefined;
  const names = new ProfileNames(info.profilesClient, client.myPubKey);

  return {
    client,
    nameOf: names.nameOf,
    weave: {
      client: weaveClient,
      openBook,
      toPocket: (bookHash) => weaveClient.assets.assetToPocket({ hrl: [dnaHash, bookHash] }),
      notify: (notification, about, from) => {
        const frame: FrameNotification = {
          title: notification.title,
          body: notification.body,
          notification_type: "library",
          icon_src: undefined,
          urgency: notification.urgency,
          timestamp: Date.now(),
          aboutWal: about ? { hrl: [dnaHash, about] } : undefined,
          fromAgent: from,
        };
        weaveClient.notifyFrame([frame]).catch((e) => console.warn("Couldn't notify", e));
      },
    },
  };
}

async function connectStandalone(): Promise<Connection> {
  const dev = devBrowserParams();
  const client = await AppWebsocket.connect(dev?.options);
  if (dev) await authorizeDevSigning(client, dev.adminPort);
  return { client, nameOf: (agent) => shortName(agent, client.myPubKey) };
}

/** Until a profile loads (or outside Moss), show a short, stable label for each agent. */
export function shortName(agent: AgentPubKey, me: AgentPubKey): string {
  if (sameHash(agent, me)) return "You";
  return `Neighbour ${encodeHashToBase64(agent).slice(5, 10)}`;
}

/** In dev, `npm run dev:browser` passes each agent's ports and app token in the URL. */
function devBrowserParams() {
  if (!import.meta.env.DEV) return undefined;
  const params = new URLSearchParams(location.search);
  const port = params.get("hcPort");
  const token = params.get("hcToken");
  const adminPort = params.get("hcAdminPort");
  if (!port || !token || !adminPort) return undefined;
  const base64 = token.replace(/-/g, "+").replace(/_/g, "/");
  return {
    adminPort,
    options: {
      url: new URL(`ws://localhost:${port}`),
      token: Array.from(atob(base64), (c) => c.charCodeAt(0)),
    },
  };
}

/** A plain browser must authorize its own zome-call signing key (launchers and Moss do this for us). */
async function authorizeDevSigning(client: AppWebsocket, adminPort: string) {
  const admin = await AdminWebsocket.connect({ url: new URL(`ws://localhost:${adminPort}`) });
  const info = await client.appInfo();
  for (const cells of Object.values(info?.cell_info ?? {})) {
    for (const cell of cells) {
      if (cell.type === CellType.Provisioned) await admin.authorizeSigningCredentials(cell.value.cell_id);
    }
  }
  await admin.client.close();
}
