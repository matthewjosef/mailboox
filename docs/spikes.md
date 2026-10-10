# Phase 0 checks: what a packaged Tool can do inside Moss 0.16

Run on 2026-10-09 with `@theweave/cli@0.16.0-dev.6` (bundles Holochain 0.7.0, Electron 32.3.3 / Chrome 128) on macOS arm64.

The probe Tool was installed from a packaged `.webhapp` (`source: { type: 'filesystem' }`), so its UI is served the way a production install serves it, not from a localhost dev server. On load it ran each check and POSTed the results to a listener on `127.0.0.1:8890`.

## Results

| Check | Result |
|---|---|
| Tool origin | `applet://<per-instance hash>`, e.g. `applet://uhc$e$kylr$…`. The hash **changes per installed Tool instance** |
| Content-Security-Policy | No CSP meta tag and no blocked requests observed |
| (a) `fetch` Open Library search API | ✅ HTTP 200, `numFound=541` for Frankenstein / Shelley |
| (a) `<img>` from covers.openlibrary.org | ✅ loaded 180×290 |
| Localhost HTTP (our listener on 127.0.0.1) | ✅ reachable, CORS preflight sent with the `applet://` origin |
| (b) Ollama, default settings | ❌ `Failed to fetch`. Ollama answers **403** because `applet://` isn't in its default `OLLAMA_ORIGINS` |
| (b) Ollama with `OLLAMA_ORIGINS="applet://*"` | ✅ `GET /api/tags` 200; the CORS preflight for `POST /api/chat` with JSON is allowed |
| (c) File APIs | ✅ file input, `FileReader`, `createImageBitmap`, canvas 2D and `OffscreenCanvas` all present. An actual user file pick will be checked with the real scanner UI in Phase 6 |

## What this means for the design

- **Book lookup** can call Open Library (and Google Books) directly from the Tool UI. No proxy is needed.
- **The local recognizer** can call Ollama directly from the Tool UI, as long as Ollama allows the Moss Tool origin. The set-up screen must tell users to allow `applet://*`; a single exact origin won't work because it changes per install.
  - Ollama desktop app on macOS: `launchctl setenv OLLAMA_ORIGINS "applet://*"`, then restart Ollama.
  - `ollama serve` / Linux systemd: set `OLLAMA_ORIGINS=applet://*` in the service environment.
  - Windows: set a user environment variable `OLLAMA_ORIGINS` = `applet://*`, then restart Ollama.
  - Detection: `fetch('http://localhost:11434/api/version')` failing while the server is running means the origin isn't allowed. A 403 is reported to the page as a network error, so the set-up screen should show the `OLLAMA_ORIGINS` step whenever the check fails, alongside the "is Ollama installed?" step.
- **Model:** the only model installed locally right now is `llama3.2:3b`, which is text-only. The scanner needs a vision model (see Phase 6 evaluation).

## Dev environment notes

- The Weave CLI loads `weave.dev.config.ts` with ts-node, which needs `typescript` installed and a root `tsconfig.json` using `"module": "commonjs"`.
- `weave --agent-idx 1 --dev-config ./weave.dev.config.ts` starts its own local `kitsune2-bootstrap-srv`, so no production bootstrap/relay servers are touched in dev.
