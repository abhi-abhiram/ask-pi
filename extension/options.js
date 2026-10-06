const $ = (id) => document.getElementById(id);
const DEFAULT_URL = "http://127.0.0.1:7421";

chrome.storage.local.get({ bridgeUrl: DEFAULT_URL, token: "", showChip: true }).then((s) => {
  $("url").value = s.bridgeUrl;
  $("token").value = s.token;
  $("chip").checked = s.showChip;
});

$("chip").addEventListener("change", () => chrome.storage.local.set({ showChip: $("chip").checked }));

$("save").addEventListener("click", async () => {
  const status = $("status");
  status.className = "";
  status.textContent = "Testing…";
  await chrome.storage.local.set({
    bridgeUrl: ($("url").value.trim() || DEFAULT_URL).replace(/\/+$/, ""),
    token: $("token").value.trim(),
    showChip: $("chip").checked,
  });

  const health = await chrome.runtime.sendMessage({ type: "health" });
  if (!health?.ok) return fail(health?.error || "Couldn't reach the bridge.");
  if (!health.authorized) return fail("Bridge found, but the token doesn't match. Copy it again from the terminal.");

  const models = await chrome.runtime.sendMessage({ type: "models" });
  if (!models?.ok) return fail(`Bridge connected, but pi didn't respond: ${models?.error}`);
  status.className = "ok";
  status.textContent = `Connected. pi has ${models.models.length} model${models.models.length === 1 ? "" : "s"} available.`;

  function fail(msg) { status.className = "bad"; status.textContent = msg; }
});
