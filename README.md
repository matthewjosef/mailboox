# MailBoox
This is a distributed Library application built on Holochain infrastructure

The basic idea is that you enter books that you have in your bookshelf, then people around you can ask to borrow books from you. If you agree to this you take the book and put it in your mailbox where they can pick-it up. When they've dropped it back, the borrower marks it returned (which notifies you), and you confirm you got it back — or say it hasn't arrived yet.

Once we really get going, this app should have a OCR scanning tool connected so that you could only scan your bookshelf with a phone, names of books are picked out, ISBN numbers and meta-information about the book are retrieved from open repositories and the books are available in your liberary.

MailBoox is being rebuilt for **Holochain 0.7** as a Tool for **[Moss](https://theweave.social) 0.16**. The original 2018 holochain-proto app is kept in [`legacy/`](legacy/) for reference.

## Install in Moss

MailBoox needs **Moss 0.16 or later**, currently a pre-release: [Moss releases](https://github.com/lightningrodlabs/moss/releases).

1. In Moss, open the **Tool Library** and choose **Manage Curation Lists**.
2. Add this URL and click **Add List**:
   `https://raw.githubusercontent.com/matthewjosef/mailboox/master/curation/lists/curations-0.16.json`
3. Install **MailBoox** into a group. Each member then fills in **My details** once: a map pin (only a ~1 km area is shared) and an exact address, which is shared encrypted with the other person in a loan.

## Releasing

See the steps at the top of [`curation/write-lists.mjs`](curation/write-lists.mjs). In short: `npm run package`, hash the
`.webhapp` with `npx weave hash-webhapp`, add the version to `curation/releases.json`, run `npm run curation:write`, and upload
that exact `.webhapp` to a GitHub release. Any zome change needs a new version branch (`0.2.x`, …).

## Developing

You need [Nix](https://determinate.systems/nix-installer/) with the Holochain binary cache enabled (see the [holonix docs](https://github.com/holochain/holonix)).

```bash
nix develop --profile .nix/devshell   # Holochain 0.7, hc, hc-scaffold, Rust, Node 22
npm install
npm test                              # builds the DNA, then runs the Sweettest scenarios
npm start                             # two agents in hc-spin
npm run dev:browser                   # two agents in ordinary browser tabs (prints a URL per agent)
npm run applet-dev                    # two agents (Alice and Bob) in Moss dev mode
npm test -w ui                        # UI unit tests (Vitest)
```

`--profile` keeps the dev tools from being garbage-collected between sessions.

## Layout

- `dnas/library/zomes/integrity/library` — entry and link types, and the validation rules every peer enforces
- `dnas/library/zomes/coordinator/library` — zome functions and notifications; tests live in `tests/library/`
- `ui/` — Svelte UI
- `docs/spikes.md` — what a Tool can reach from inside Moss (Open Library, local Ollama)
