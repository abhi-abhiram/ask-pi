# Chrome Web Store submission

Copy and paste for each field in the [Developer Dashboard](https://chrome.google.com/webstore/devconsole). Build the upload with `./scripts/package.sh`.

## Store listing

**Name** (from manifest): Ask pi

**Summary** (max 132 characters, from the manifest `description`):

> Select text on any page and ask your local pi harness about it.

**Category:** Tools

**Language:** English

**Description:**

```
Select text on any web page and ask your local pi AI harness about it. The answer streams into a floating panel next to your selection, and you can keep asking follow-ups in the same thread.

REQUIRES A LOCAL SETUP
Ask pi is a companion to pi (https://pi.dev), an AI coding harness you run on your own computer. It is not affiliated with pi's authors. You need:
• pi installed and set up with a model
• Node.js 18 or newer
• The Ask pi bridge, a small open-source file: https://github.com/abhi-abhiram/ask-pi

After installing, the settings page walks you through starting the bridge and pasting its token.

HOW TO USE
• Select text, then click the π button, press Alt+Shift+A, or right-click and choose "Ask pi about…"
• Type a question, or tap a quick action: Explain, Summarize, Define terms, Push back
• Enter asks, Shift+Enter adds a line, Esc closes. Stop an answer at any time.
• Pick any model you've set up in pi from the panel footer
• Drag the panel anywhere. It follows your selection as you scroll.

PRIVATE BY DESIGN
• Everything goes to the bridge on your own computer (127.0.0.1), never to the developer
• The bridge requires a secret token and rejects requests from web pages
• pi runs without tools by default, so text on a page can't make it run commands or touch files
• No analytics, ads or tracking

Open source: https://github.com/abhi-abhiram/ask-pi
```

**Graphics:**

| Asset | Size | File |
|---|---|---|
| Store icon | 128×128 | `extension/icons/128.png` |
| Screenshots (upload in this order) | 1280×800 | `store/images/1-answer.png`, `2-follow-ups-dark.png`, `3-select-text.png`, `4-settings.png` |
| Small promo tile | 440×280 | `store/images/promo-small-440x280.png` |
| Marquee promo tile (optional) | 1400×560 | not made |

The screenshots were taken in headless Chromium against a demo article, with real answers from pi.

**Official URL / Homepage:** https://github.com/abhi-abhiram/ask-pi

**Support URL:** https://github.com/abhi-abhiram/ask-pi/issues

## Privacy practices

**Single purpose:**

```
Lets the user ask a locally running pi AI harness questions about text they have selected on a web page, and shows the answer in a panel next to the selection.
```

**Permission justifications:**

`storage`:
```
Saves the user's settings on their device: the local bridge address and access token, the chosen model, and whether the π button is shown.
```

`contextMenus`:
```
Adds an "Ask pi about …" item to the right-click menu when text is selected, as one of the ways to open the question panel.
```

Host permissions (`http://127.0.0.1/*`, `http://localhost/*`):
```
The extension only talks to the Ask pi bridge running on the user's own computer, which forwards questions to their local pi harness. It makes no requests to any remote server.
```

Content script on all sites (`<all_urls>`):
```
Users can select text and ask about it on any page they read, so the content script must be present on every page to show the π button and the answer panel next to the selection. It reads the selection and nearby text, the page title and the URL only when the user asks a question, and sends them only to the local bridge on the user's computer.
```

**Are you using remote code?** No, I am not using remote code.

**Data usage.** Tick these (the page title and URL go along with each question):

- [x] Website content (selected text and surrounding text)
- [x] Web history (the URL of the page the question is about)

Then certify all three:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** https://github.com/abhi-abhiram/ask-pi/blob/main/PRIVACY.md

## Test instructions (for the reviewer)

```
Ask pi needs a local backend, the pi AI harness (https://pi.dev), plus a small bridge script. Without the bridge, the panel opens and shows a "Can't reach the pi bridge" message, which is the expected behavior.

To test fully:
1. Install pi and set up any model provider (see https://pi.dev).
2. Install Node.js 18+.
3. Run: curl -fsSLO https://raw.githubusercontent.com/abhi-abhiram/ask-pi/main/bridge/pi-bridge.mjs && node pi-bridge.mjs
4. Copy the token it prints into the extension's settings page (opens on install), then click "Save and test connection".
5. On any web page, select some text, click the π button, and click "Explain".
```

## Distribution

- **Visibility:** Public (or Unlisted to try it first)
- **Regions:** All regions
- **Pricing:** Free
