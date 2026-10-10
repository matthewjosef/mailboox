import { defineConfig } from "@theweave/cli";

// Runs MailBoox inside sandboxed Moss instances: `npm run applet-dev` (two agents)
// or `npm run applet-dev-1` (one). The UI is served live from Vite on port 8888.
export default defineConfig({
  groups: [
    {
      name: "Maple Street",
      networkSeed: "mailboox-dev-maple-street",
      icon: { type: "filesystem", path: "./ui/public/icon.png" },
      creatingAgent: { agentIdx: 1, agentProfile: { nickname: "Alice" } },
      joiningAgents: [{ agentIdx: 2, agentProfile: { nickname: "Bob" } }],
      applets: [
        { name: "MailBoox", instanceName: "MailBoox", registeringAgent: 1, joiningAgents: [2] },
      ],
    },
  ],
  applets: [
    {
      name: "MailBoox",
      subtitle: "Lend books to your neighbours",
      description:
        "A neighbourhood library: list the books on your shelf, lend them out through your mailbox, and keep track of returns.",
      icon: { type: "filesystem", path: "./ui/public/icon.png" },
      source: { type: "localhost", happPath: "./workdir/mailboox.happ", uiPort: 8888 },
    },
  ],
  toolCurations: [],
});
