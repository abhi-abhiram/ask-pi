// Ask pi — background service worker.
// Owns all network traffic to the local bridge (content scripts can't reliably
// reach localhost from arbitrary pages) and streams answers back over a port.

const DEFAULTS = { bridgeUrl: "http://127.0.0.1:7421", token: "", model: null };

async function settings() {
  const s = await chrome.storage.local.get(DEFAULTS);
  s.bridgeUrl = (s.bridgeUrl || DEFAULTS.bridgeUrl).replace(/\/+$/, "");
  return s;
}

function friendlyNetworkError(err, url) {
  if (err?.name === "AbortError") return "Stopped.";
  return `Can't reach the pi bridge at ${url}. Start it with "node pi-bridge.mjs" and try again.`;
}

async function bridgeFetch(path, init = {}) {
  const s = await settings();
  const res = await fetch(s.bridgeUrl + path, {
    ...init,
    headers: { "content-type": "application/json", "x-pi-bridge-token": s.token, ...(init.headers || {}) },
  }).catch((err) => { throw new Error(friendlyNetworkError(err, s.bridgeUrl)); });
  if (res.status === 401) throw new Error("The bridge rejected the token. Paste the token the bridge printed into Ask pi settings.");
  return res;
}

// ---- streaming asks over a long-lived port ----
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "pi-ask") return;
  let controller = null;

  port.onMessage.addListener(async (msg) => {
    if (msg.type === "stop") { controller?.abort(); return; }
    if (msg.type !== "ask") return;

    controller = new AbortController();
    const post = (m) => { try { port.postMessage(m); } catch {} };

    try {
      const s = await settings();
      const res = await bridgeFetch("/ask", {
        method: "POST",
        body: JSON.stringify({ convId: msg.convId, message: msg.message, model: msg.model || s.model }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Bridge error ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let gotTerminal = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let sep;
        while ((sep = buf.indexOf("\n\n")) !== -1) {
          const block = buf.slice(0, sep);
          buf = buf.slice(sep + 2);
          let event = "message", data = "";
          for (const line of block.split("\n")) {
            if (line.startsWith("event: ")) event = line.slice(7);
            else if (line.startsWith("data: ")) data += line.slice(6);
          }
          let payload = {};
          try { payload = data ? JSON.parse(data) : {}; } catch {}
          if (event === "done" || event === "error") gotTerminal = true;
          post({ type: event, ...payload });
        }
      }
      if (!gotTerminal) post({ type: "done" });
    } catch (err) {
      if (err.name === "AbortError") post({ type: "stopped" });
      else post({ type: "error", message: err.message });
    } finally {
      controller = null;
    }
  });

  port.onDisconnect.addListener(() => controller?.abort());
});

// ---- one-shot requests ----
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "models") {
        const res = await bridgeFetch("/models");
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Couldn't load models");
        sendResponse({ ok: true, ...body, selected: (await settings()).model });
      } else if (msg.type === "setModel") {
        await chrome.storage.local.set({ model: msg.model });
        sendResponse({ ok: true });
      } else if (msg.type === "end") {
        await bridgeFetch("/end", { method: "POST", body: JSON.stringify({ convId: msg.convId }) }).catch(() => {});
        sendResponse({ ok: true });
      } else if (msg.type === "health") {
        const s = await settings();
        const res = await bridgeFetch("/health");
        const body = await res.json();
        sendResponse({ ok: true, authorized: body.authorized, url: s.bridgeUrl });
      } else if (msg.type === "openOptions") {
        chrome.runtime.openOptionsPage();
        sendResponse({ ok: true });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();
  return true; // async response
});

// ---- context menu + keyboard shortcut ----
chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.create({ id: "ask-pi", title: "Ask pi about “%s”", contexts: ["selection"] });
  if (details.reason === "install") chrome.runtime.openOptionsPage();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "ask-pi" && tab?.id != null) {
    chrome.tabs.sendMessage(tab.id, { type: "open-panel" }, { frameId: info.frameId ?? 0 }).catch(() => {});
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "ask-selection") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id != null) chrome.tabs.sendMessage(tab.id, { type: "open-panel" }).catch(() => {});
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
