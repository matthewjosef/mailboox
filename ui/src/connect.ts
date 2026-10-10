import {
  AdminWebsocket,
  AppWebsocket,
  CellType,
  encodeHashToBase64,
  type AgentPubKey,
  type AppClient,
} from "@holochain/client";

import { sameHash } from "./library/actions";

export interface Connection {
  client: AppClient;
  nameOf: (agent: AgentPubKey) => string;
}

/** Connect to Holochain when running standalone (hc-spin / a launcher). */
export async function connect(): Promise<Connection> {
  const dev = devBrowserParams();
  const client = await AppWebsocket.connect(dev?.options);
  if (dev) await authorizeDevSigning(client, dev.adminPort);
  return { client, nameOf: (agent) => shortName(agent, client.myPubKey) };
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

/** Until profiles are available, show a short, stable label for each agent. */
export function shortName(agent: AgentPubKey, me: AgentPubKey): string {
  if (sameHash(agent, me)) return "You";
  return `Neighbour ${encodeHashToBase64(agent).slice(5, 10)}`;
}
