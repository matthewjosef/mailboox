// Generates the Moss Tool list and curation list for MailBoox.
//
//   npm run curation:write
//
// To publish a new version:
//   1. npm run package
//   2. npx weave hash-webhapp <version> workdir/mailboox.webhapp
//   3. Add an entry to curation/releases.json under its version branch (e.g. "0.1.x"),
//      with the hashes from step 2 and the GitHub release download URL.
//      Every version in a branch must have the same happ hash (Moss treats a branch as one
//      network), so ANY zome change needs a new branch, e.g. "0.2.x". UI-only releases can
//      stay on the current branch.
//   4. npm run curation:write, commit, then upload *that same* .webhapp to the GitHub release
//      (rebuilding changes the zip, and so the hashes).
//
// Users add CURATIONS_URL in Moss: Tool Library → Manage Curation Lists.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { defineCurationLists, defineDevCollectiveToolList } from "@theweave/moss-types";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = "https://github.com/matthewjosef/mailboox";
const LISTS_BASE = "https://raw.githubusercontent.com/matthewjosef/mailboox/master/curation/lists";
export const TOOL_LIST_URL = `${LISTS_BASE}/tool-list-0.16.json`;
export const CURATIONS_URL = `${LISTS_BASE}/curations-0.16.json`;

const icon = `data:image/png;base64,${readFileSync(join(here, "../ui/public/icon.png")).toString("base64")}`;
const releases = JSON.parse(readFileSync(join(here, "releases.json"), "utf8"));

// IDs and version branches MUST NOT change once published.
const toolList = defineDevCollectiveToolList({
  developerCollective: {
    id: "mailboox",
    name: "MailBoox contributors",
    description: "The people building MailBoox, a neighbourhood library for Moss, since 2018.",
    contact: { website: REPO },
    icon,
  },
  tools: Object.entries(releases).map(([versionBranch, versions]) => ({
    id: "mailboox",
    versionBranch,
    title: "MailBoox",
    subtitle: "Lend books to your neighbours",
    // Moss renders this as markdown: "## Overview" first, and a "## Features" section.
    description: [
      "## Overview",
      "",
      "A neighbourhood library. List the books on your shelf, lend them to people nearby through your mailbox, and keep track of every handoff and return.",
      "",
      "## Features",
      "",
      "- Browse everyone's shelves, search by title or author, and sort by distance",
      "- Ask to borrow; the owner accepts, then hands it over in person or leaves it in a mailbox with a note",
      "- The borrower confirms pickup, marks it returned, and the owner confirms or says it hasn't arrived",
      "- Approximate location (rounded to about 1 km) is visible to the group; exact addresses are shared encrypted, only with the other person in a loan",
      "- Moss notifications for requests, handoffs and returns, including ones that arrived while you were offline",
      "- Books are Weave assets: link them from other Tools and find them in group search",
      "",
      "## Status",
      "",
      "Early release for Moss 0.16 (Holochain 0.7). Source: " + REPO,
    ].join("\n"),
    icon,
    tags: ["books", "library", "lending", "sharing", "neighbourhood"],
    versions,
  })),
});

const curations = defineCurationLists({
  curator: {
    name: "MailBoox contributors",
    description: "Curation list for MailBoox. Requires Moss 0.16 or later.",
    contact: { website: REPO },
    icon,
  },
  curationLists: {
    default: {
      name: "MailBoox",
      description: "MailBoox for Moss 0.16+.",
      tags: ["books", "library"],
      tools: Object.keys(releases).map((versionBranch) => ({
        toolListUrl: TOOL_LIST_URL,
        toolId: "mailboox",
        versionBranch,
        tags: ["books", "library"],
      })),
    },
  },
});

validate(toolList);

writeFileSync(join(here, "lists/tool-list-0.16.json"), JSON.stringify(toolList, null, 2) + "\n");
writeFileSync(join(here, "lists/curations-0.16.json"), JSON.stringify(curations, null, 2) + "\n");
console.log(`Wrote lists. Users add this URL in Moss → Tool Library → Manage Curation Lists:\n  ${CURATIONS_URL}`);

/** The checks Moss's official curation repo runs (0.16/validate-lists.js), so a bad list is never published. */
function validate(list) {
  for (const tool of list.tools) {
    new URL(tool.icon);
    const sections = [...tool.description.matchAll(/^(#{1,6})[ \t]+(.+?)[ \t]*$/gm)];
    if (sections.some((m) => m[1] !== "##")) throw new Error("Description may only use level-2 headings");
    if (sections[0]?.[2] !== "Overview") throw new Error('Description must open with "## Overview"');
    if (!sections.some((m) => m[2] === "Features")) throw new Error('Description needs a "## Features" section');
    const happHashes = new Set();
    for (const v of tool.versions) {
      if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(v.version)) throw new Error(`Bad semver ${v.version}`);
      if (v.releasedAt < 1711978174000 || v.releasedAt > 2690198974000) throw new Error(`releasedAt must be ms: ${v.version}`);
      if (!v.url.toLowerCase().endsWith(".webhapp")) throw new Error(`URL must end in .webhapp: ${v.version}`);
      new URL(v.url);
      if (/^#{1,6}[ \t]+/m.test(v.changelog)) throw new Error(`Changelog can't contain headings: ${v.version}`);
      const { happSha256, webhappSha256, uiSha256 } = v.hashes;
      if (new Set([happSha256, webhappSha256, uiSha256]).size !== 3) throw new Error(`Identical hashes: ${v.version}`);
      happHashes.add(happSha256);
    }
    if (happHashes.size > 1) {
      throw new Error(`Versions on branch ${tool.versionBranch} have different happ hashes; zome changes need a new branch`);
    }
  }
}
