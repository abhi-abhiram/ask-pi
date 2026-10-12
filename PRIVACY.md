# Ask pi privacy policy

_Last updated: 2026-10-12_

Ask pi is a browser extension that sends text you select on a web page to the [pi](https://pi.dev) harness running on your own computer, and shows pi's answer.

## What the extension handles

When you ask a question, the extension reads and sends:

- the text you selected, plus a little of the text around it, for context
- the page's title and URL
- the question you typed

This only happens when you ask. The extension doesn't read pages in the background, and it doesn't track your browsing.

## Where it goes

The extension sends this data **only to the local bridge on your own computer** (by default `http://127.0.0.1:7421`). The bridge hands it to your local pi process. The extension itself never sends anything to the developer or to any other remote server.

pi may then send your question to the AI model provider **you** set up in pi (for example Anthropic, OpenAI or a local model). That provider's privacy policy covers that step. The extension doesn't choose or control the provider.

## What is stored

In Chrome's extension storage (`chrome.storage.local`, which stays on your device), the extension keeps:

- the bridge address and access token
- your chosen model
- whether the π button is shown

Conversations are not saved. Each panel's pi process runs with `--no-session` and ends when you close the panel or after 10 idle minutes.

## Sharing

The developer doesn't collect, sell or share any data. There are no analytics, ads or tracking.

## Contact

Questions or issues: <https://github.com/abhiram-makerstudio/ask-pi/issues>
