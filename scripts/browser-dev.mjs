// Run two agents in sandbox conductors and print browser URLs for each.
//
//   npm run dev:browser     (inside `nix develop`)
//
// Starts a local kitsune2 bootstrap/relay server, two sandbox conductors with the
// MailBoox hApp, and the Vite dev server. Each URL carries its agent's app
// interface port and auth token, which ui/src/connect.ts picks up in dev mode.
import { spawn } from "node:child_process";
import { once } from "node:events";

import { AdminWebsocket } from "@holochain/client";

const APP_ID = "mailboox";
const UI_PORT = Number(process.env.UI_PORT ?? 8888);
const children = [];

function run(cmd, args, opts = {}) {
  const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"], ...opts });
  children.push(child);
  return child;
}

function waitFor(child, regex, label) {
  return new Promise((resolve, reject) => {
    let seen = "";
    const onData = (chunk) => {
      seen += chunk.toString();
      const match = seen.match(regex);
      if (match) resolve(match);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (code) => reject(new Error(`${label} exited (${code}) before it was ready:\n${seen}`)));
  });
}

function shutdown() {
  for (const child of children) child.kill("SIGINT");
}
process.on("SIGINT", () => { shutdown(); process.exit(0); });
process.on("exit", shutdown);

// 1. Local bootstrap + relay server.
const bootstrap = run("kitsune2-bootstrap-srv", ["--listen", "127.0.0.1:0"]);
const [, bootstrapAddr] = await waitFor(bootstrap, /#kitsune2_bootstrap_srv#listening#([0-9.:]+)#/, "bootstrap server");
const bootstrapUrl = `http://${bootstrapAddr}`;
console.log(`bootstrap/relay: ${bootstrapUrl}`);

// 2. Two sandbox conductors running the hApp.
await once(run("hc", ["sandbox", "clean"]), "exit");
const sandbox = run("hc", [
  "sandbox", "--piped", "generate", "--in-process-lair", "-n", "2", "--app-id", APP_ID, "--run=0",
  "workdir/mailboox.happ", "network", "--bootstrap", bootstrapUrl, "quic", bootstrapUrl,
]);
sandbox.stdin.end("passphrase\n");
const adminPorts = [];
await new Promise((resolve, reject) => {
  let seen = "";
  const onData = (chunk) => {
    seen += chunk.toString();
    for (const m of seen.matchAll(/"admin_port":(\d+)/g)) {
      const port = Number(m[1]);
      if (!adminPorts.includes(port)) adminPorts.push(port);
    }
    if (adminPorts.length >= 2) resolve();
  };
  sandbox.stdout.on("data", onData);
  sandbox.stderr.on("data", onData);
  sandbox.on("exit", (code) => reject(new Error(`hc sandbox exited (${code}):\n${seen}`)));
});

// 3. An app interface and a reusable token per agent.
const urls = [];
for (const [i, adminPort] of adminPorts.entries()) {
  const admin = await AdminWebsocket.connect({
    url: new URL(`ws://127.0.0.1:${adminPort}`),
    wsClientOptions: { origin: "mailboox-dev" },
  });
  const { port } = await admin.attachAppInterface({ allowed_origins: "*" });
  const { token } = await admin.issueAppAuthenticationToken({
    installed_app_id: APP_ID,
    single_use: false,
    expiry_seconds: 0,
  });
  await admin.client.close();
  const tokenParam = Buffer.from(token).toString("base64url");
  urls.push(`http://localhost:${UI_PORT}/?hcPort=${port}&hcAdminPort=${adminPort}&hcToken=${tokenParam}&agent=${i + 1}`);
}

// 4. The UI.
const vite = run("npm", ["run", "start", "-w", "ui"], { env: { ...process.env, UI_PORT: String(UI_PORT) } });
await waitFor(vite, /ready in/i, "vite");

console.log("\nOpen each agent in its own browser tab:");
for (const url of urls) console.log(`  ${url}`);
console.log("\nCtrl-C to stop.");
