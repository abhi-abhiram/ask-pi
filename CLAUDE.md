# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

**Ask pi**: a Chrome MV3 extension plus a tiny local Node bridge. Select text on any page and ask the local [pi](https://pi.dev) harness about it. Answers stream into a floating panel next to the selection, with follow-ups in the same thread.

```
content.js (π button + panel) ──port──▶ background.js ──HTTP/SSE──▶ bridge/pi-bridge.mjs (127.0.0.1:7421)
                                                                       │ JSONL over stdin/stdout
                                                                       ▼
                                                             pi --mode rpc --no-session --no-tools
```

## Layout

- `bridge/pi-bridge.mjs`: localhost HTTP/SSE server that spawns one `pi --mode rpc` process per panel. Endpoints: `GET /health`, `GET /models`, `POST /ask` (SSE stream), `POST /end`.
- `extension/background.js`: service worker. It owns **all** network traffic to the bridge, because content scripts can't reliably reach localhost. It streams events to the content script over a `chrome.runtime` port named `pi-ask`, and also handles the context menu and the `ask-selection` command.
- `extension/content.js`: the π button, the floating panel (inside a **closed** shadow root), panel positioning, and a small Markdown renderer.
- `extension/options.html` / `options.js`: settings page (bridge URL, token).
- `extension/manifest.json`: MV3 manifest.

## Running

- Bridge: `node bridge/pi-bridge.mjs` (Node 18+, `pi` on PATH). Options: `--port`, `--pi`, `--cwd`, `--allow-tools`; anything after `--` goes to pi.
- Extension: `chrome://extensions` → Developer mode → **Load unpacked** → `extension/`. After you edit extension files, reload it there.
- Quick bridge check: `curl -H "x-pi-bridge-token: $(cat ~/.pi-ask-bridge-token)" http://127.0.0.1:7421/health`

There is no build step, package.json, test suite or linter. Check changes by hand: run the bridge, reload the extension, and try it on a real page.

## Conventions and constraints

- **Zero dependencies.** The bridge uses only Node built-ins; the extension is plain JS with no bundler or framework. Don't add npm packages or a build step without asking.
- **Keep the security model intact:**
  - The bridge binds to `127.0.0.1` only and needs the `x-pi-bridge-token` header on every request (compared with `timingSafeEqual`). The token lives in `~/.pi-ask-bridge-token` (mode 0600) or `PI_BRIDGE_TOKEN`.
  - Web-page `Origin`s are rejected; only `chrome-extension://` origins or no Origin (curl) are allowed.
  - pi runs with `--no-tools` by default, because selected web text is untrusted and may carry prompt injection. Don't loosen this default.
  - The Markdown renderer escapes all HTML **before** formatting. Never insert model output with `innerHTML` unless it has been escaped.
- pi's RPC framing is strict JSONL split on `\n` only. Don't split on U+2028/2029.
- Session limits: 10 min idle timeout, max 6 concurrent pi processes (`IDLE_MS`, `MAX_SESSIONS`).
- Panel UI styles live inside the shadow root in `content.js` and use CSS custom properties, with a dark-mode override. Keep page CSS from leaking in, and keep panel CSS from leaking out.
- When behavior, flags or setup steps change, update `README.md`.

## Git workflow

- Never commit directly to `main`/`develop` unless explicitly told to. Branch first: `feat/…`, `bug/…`, `docs/…`, `fix/…`, `refactor/…`.
- Use Conventional Commits and keep commits atomic.
- For PR screenshots, use `gh pr edit <n> --attach '<file>#<alt>'`. Don't commit screenshot images.
