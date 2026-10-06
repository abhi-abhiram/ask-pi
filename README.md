# Ask pi

Select text on any web page and ask your local [pi](https://pi.dev) harness about it. The answer streams into a floating panel anchored to your selection, and you can keep asking follow-ups in the same thread.

```
Chrome page ──▶ content.js (π button + panel)
                   │  port
                   ▼
              background.js ──HTTP/SSE──▶ pi-bridge.mjs (127.0.0.1:7421)
                                              │ JSONL stdin/stdout
                                              ▼
                                        pi --mode rpc --no-session --no-tools
```

A browser extension can't start local processes, so `bridge/pi-bridge.mjs` is a tiny dependency-free Node server that runs pi in RPC mode and streams its output to the extension.

## Setup

1. **Start the bridge** (needs Node 18+ and `pi` on your PATH):
   ```bash
   node bridge/pi-bridge.mjs
   ```
   It prints a token (also saved to `~/.pi-ask-bridge-token`).

2. **Load the extension:** open `chrome://extensions`, turn on Developer mode, choose **Load unpacked**, and pick the `extension` folder.

3. **Paste the token** into the settings page that opens, then choose **Save and test connection**.

## Using it

- Select text, then click the **π** button, press **Alt+Shift+A**, or right-click and choose **Ask pi about "…"**.
- Type a question or tap a quick action (Explain, Summarize, Define terms, Push back).
- **Enter** asks, **Shift+Enter** adds a line, **Esc** closes. While answering, the Ask button becomes **Stop**.
- Pick a model from the footer menu. The list comes from pi's configured models; your choice is remembered.
- Drag the panel by its header to pin it somewhere else.

### Where the panel appears

The panel is centered horizontally on the selection with a caret pointing at it. It goes below the selection when there's room, otherwise above (growing upward so it never covers the text), otherwise beside it, and as a last resort centered in the viewport. It follows the text as you scroll, including inside scrollable containers, and the selected text stays highlighted while you type.

## Bridge options

```bash
node pi-bridge.mjs --port 7421          # default port
node pi-bridge.mjs --pi /path/to/pi     # custom pi binary
node pi-bridge.mjs --cwd ~/notes        # working dir for pi (default: an empty temp dir)
node pi-bridge.mjs --allow-tools        # let pi use its tools (off by default, see below)
node pi-bridge.mjs -- --provider anthropic --model claude-sonnet-4-5   # anything after -- goes to pi
```

Each panel gets its own pi process so follow-ups keep context. Processes close when you close the panel or after 10 idle minutes (at most 6 at once).

## Security notes

- The bridge listens on `127.0.0.1` only and requires the token on every request. Requests from web-page origins are rejected; only `chrome-extension://` origins (or tools without an Origin, like curl) are allowed.
- **Tools are off by default.** Selected web text can contain prompt-injection attempts. With `--no-tools`, pi can only answer in text. Only use `--allow-tools` if you trust what you're selecting.
- Answers are rendered with a small Markdown renderer that escapes all HTML first.

## Files

```
extension/
  manifest.json   MV3 manifest
  background.js   talks to the bridge, streams answers over a port
  content.js      π button, floating panel, positioning, Markdown renderer
  options.html/js settings page
  icons/
bridge/
  pi-bridge.mjs   localhost HTTP/SSE ↔ pi RPC
```
