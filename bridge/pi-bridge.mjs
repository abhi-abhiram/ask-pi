#!/usr/bin/env node
// pi-bridge: a tiny localhost HTTP server that lets the "Ask pi" Chrome
// extension talk to your local pi harness (pi --mode rpc).
//
// Usage:
//   node pi-bridge.mjs [--port 7421] [--pi pi] [--cwd DIR] [--allow-tools] [-- <extra pi flags>]
//
// No dependencies. Node 18+.

import http from "node:http";
import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ---------- config ----------
const argv = process.argv.slice(2);
const dashdash = argv.indexOf("--");
const own = dashdash === -1 ? argv : argv.slice(0, dashdash);
const extraPiArgs = dashdash === -1 ? [] : argv.slice(dashdash + 1);
const opt = (name, def) => {
  const i = own.indexOf(name);
  return i !== -1 && own[i + 1] ? own[i + 1] : def;
};

const PORT = Number(opt("--port", process.env.PI_BRIDGE_PORT || 7421));
const PI_BIN = opt("--pi", process.env.PI_BIN || "pi");
const ALLOW_TOOLS = own.includes("--allow-tools");
const IDLE_MS = 10 * 60 * 1000; // kill conversation processes idle for 10 min
const MAX_SESSIONS = 6;

// Run pi in an empty scratch dir by default so it doesn't pick up a random
// project's AGENTS.md or touch files.
const CWD = path.resolve(opt("--cwd", path.join(os.tmpdir(), "pi-ask-bridge")));
fs.mkdirSync(CWD, { recursive: true });

const PI_ARGS = [
  "--mode", "rpc",
  "--no-session",
  ...(ALLOW_TOOLS ? [] : ["--no-tools"]),
  ...extraPiArgs,
];

// Shared secret so random websites can't drive your pi through localhost.
const TOKEN_FILE = path.join(os.homedir(), ".pi-ask-bridge-token");
let TOKEN = process.env.PI_BRIDGE_TOKEN;
if (!TOKEN) {
  try { TOKEN = fs.readFileSync(TOKEN_FILE, "utf8").trim(); } catch {}
  if (!TOKEN) {
    TOKEN = randomBytes(18).toString("base64url");
    fs.writeFileSync(TOKEN_FILE, TOKEN + "\n", { mode: 0o600 });
  }
}

// ---------- pi RPC process wrapper ----------
let seq = 0;
const nextId = () => `b${Date.now().toString(36)}${(seq++).toString(36)}`;

class PiProcess {
  constructor(label) {
    this.label = label;
    this.pending = new Map(); // id -> {resolve, reject}
    this.listeners = new Set();
    this.lastUsed = Date.now();
    this.busy = false;
    this.modelKey = null;
    this.dead = false;
    this.stderrTail = "";

    this.child = spawn(PI_BIN, PI_ARGS, { cwd: CWD, stdio: ["pipe", "pipe", "pipe"] });

    // Strict JSONL framing: split on LF only (not U+2028/2029).
    const decoder = new StringDecoder("utf8");
    let buf = "";
    this.child.stdout.on("data", (chunk) => {
      buf += decoder.write(chunk);
      let nl;
      while ((nl = buf.indexOf("\n")) !== -1) {
        let line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line.trim()) continue;
        let rec;
        try { rec = JSON.parse(line); } catch { continue; }
        this.#onRecord(rec);
      }
    });
    this.child.stderr.on("data", (d) => {
      this.stderrTail = (this.stderrTail + d.toString()).slice(-2000);
    });
    this.child.on("error", (err) => this.#die(
      err.code === "ENOENT"
        ? `Could not start "${PI_BIN}". Is pi installed and on your PATH? (or pass --pi /path/to/pi)`
        : err.message));
    this.child.on("exit", (code) => this.#die(
      `pi exited (code ${code}). ${this.stderrTail.trim().split("\n").slice(-3).join(" ")}`.trim()));
  }

  #onRecord(rec) {
    if (rec.type === "response" && rec.id && this.pending.has(rec.id)) {
      const p = this.pending.get(rec.id);
      this.pending.delete(rec.id);
      rec.success ? p.resolve(rec.data) : p.reject(new Error(rec.error || `${rec.command} failed`));
      return;
    }
    for (const l of this.listeners) l(rec);
  }

  #die(msg) {
    if (this.dead) return;
    this.dead = true;
    for (const p of this.pending.values()) p.reject(new Error(msg));
    this.pending.clear();
    for (const l of this.listeners) l({ type: "__bridge_dead", message: msg });
  }

  send(cmd, timeoutMs = 30000) {
    if (this.dead) return Promise.reject(new Error("pi process is not running"));
    const id = nextId();
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`pi did not answer "${cmd.type}" in time`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (d) => { clearTimeout(t); resolve(d); },
        reject: (e) => { clearTimeout(t); reject(e); },
      });
      this.child.stdin.write(JSON.stringify({ ...cmd, id }) + "\n");
    });
  }

  kill() {
    this.dead = true;
    try { this.child.stdin.end(); } catch {}
    setTimeout(() => { try { this.child.kill(); } catch {} }, 2000);
  }
}

// One pi process per conversation (so follow-up questions keep context),
// plus one control process for listing models.
const sessions = new Map();
let control = null;

function getSession(convId) {
  let s = sessions.get(convId);
  if (s && !s.dead) return s;
  if (sessions.size >= MAX_SESSIONS) {
    const idle = [...sessions.entries()].filter(([, v]) => !v.busy)
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
    if (idle) { idle[1].kill(); sessions.delete(idle[0]); }
  }
  s = new PiProcess(convId);
  sessions.set(convId, s);
  return s;
}

function getControl() {
  if (!control || control.dead) control = new PiProcess("control");
  return control;
}

setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (s.dead || (!s.busy && now - s.lastUsed > IDLE_MS)) { s.kill(); sessions.delete(id); }
  }
  if (control && !control.dead && now - control.lastUsed > IDLE_MS) { control.kill(); control = null; }
}, 60000).unref();

let modelCache = { at: 0, models: null };
async function listModels() {
  if (modelCache.models && Date.now() - modelCache.at < 60000) return modelCache.models;
  const c = getControl();
  c.lastUsed = Date.now();
  const [models, state] = await Promise.all([
    c.send({ type: "get_available_models" }),
    c.send({ type: "get_state" }).catch(() => ({})),
  ]);
  const out = {
    current: state?.model ? { provider: state.model.provider, id: state.model.id } : null,
    models: (models?.models || []).map((m) => ({ provider: m.provider, id: m.id, name: m.name || m.id })),
  };
  modelCache = { at: Date.now(), models: out };
  return out;
}

// ---------- HTTP ----------
function authorized(req) {
  // Only browser extensions (or curl without an Origin) may call us, and
  // they must present the token.
  const origin = req.headers.origin;
  if (origin && !origin.startsWith("chrome-extension://")) return false;
  const given = Buffer.from(String(req.headers["x-pi-bridge-token"] || ""));
  const want = Buffer.from(TOKEN);
  return given.length === want.length && timingSafeEqual(given, want);
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let data = "";
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 1_000_000) throw new Error("Request too large");
  }
  return data ? JSON.parse(data) : {};
}

async function handleAsk(req, res) {
  const { convId, message, model } = await readBody(req);
  if (!convId || !message) return json(res, 400, { error: "convId and message are required" });

  const s = getSession(String(convId));
  if (s.aborting) await s.aborting; // let a stopped run wind down first
  if (s.busy) return json(res, 409, { error: "This conversation is still answering" });
  s.busy = true;
  s.lastUsed = Date.now();

  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const emit = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  let finished = false;
  const finish = (event, data) => {
    if (finished) return;
    finished = true;
    s.listeners.delete(onEvent);
    s.busy = false;
    s.lastUsed = Date.now();
    emit(event, data);
    res.end();
  };

  const onEvent = (rec) => {
    switch (rec.type) {
      case "message_update": {
        const e = rec.assistantMessageEvent || {};
        if (e.type === "text_delta") emit("delta", { text: e.delta });
        else if (e.type === "thinking_delta") emit("thinking", { text: e.delta });
        break;
      }
      case "message_end": {
        const m = rec.message || {};
        if (m.role === "assistant" && m.stopReason === "error") {
          emit("notice", { text: m.errorMessage || "The model returned an error" });
        }
        break;
      }
      case "tool_execution_start":
        emit("tool", { name: rec.toolName });
        break;
      case "auto_retry_start":
        emit("notice", { text: `Retrying (${rec.attempt}/${rec.maxAttempts}): ${rec.errorMessage || ""}` });
        break;
      case "agent_settled":
        finish("done", {});
        break;
      case "__bridge_dead":
        sessions.delete(String(convId));
        finish("error", { message: rec.message });
        break;
    }
  };
  s.listeners.add(onEvent);

  // If the extension closes the stream (user hit Stop), abort the run.
  res.on("close", () => {
    if (!finished) {
      finished = true;
      s.listeners.delete(onEvent);
      // pi answers "abort" once the session is idle; stay busy until then.
      s.aborting = s.send({ type: "abort" }, 15000).catch(() => {}).finally(() => {
        s.aborting = null;
        s.busy = false;
        s.lastUsed = Date.now();
      });
    }
  });

  try {
    const key = model?.provider && model?.id ? `${model.provider}/${model.id}` : null;
    if (key && key !== s.modelKey) {
      await s.send({ type: "set_model", provider: model.provider, modelId: model.id });
      s.modelKey = key;
    }
    const r = await s.send({ type: "prompt", message: String(message) });
    if (r?.disposition === "handled") finish("done", {});
  } catch (err) {
    finish("error", { message: err.message });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET" && url.pathname === "/health") {
      // Health is unauthenticated but reveals nothing beyond "a bridge is here".
      return json(res, 200, { ok: true, authorized: authorized(req) });
    }
    if (!authorized(req)) return json(res, 401, { error: "Missing or wrong bridge token" });

    if (req.method === "GET" && url.pathname === "/models") return json(res, 200, await listModels());
    if (req.method === "POST" && url.pathname === "/ask") return await handleAsk(req, res);
    if (req.method === "POST" && url.pathname === "/end") {
      const { convId } = await readBody(req);
      const s = sessions.get(String(convId));
      if (s) { s.kill(); sessions.delete(String(convId)); }
      return json(res, 200, { ok: true });
    }
    json(res, 404, { error: "Not found" });
  } catch (err) {
    if (!res.headersSent) json(res, 500, { error: err.message });
    else res.end();
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n  pi bridge listening on http://127.0.0.1:${PORT}`);
  console.log(`  pi command: ${PI_BIN} ${PI_ARGS.join(" ")}`);
  console.log(`  working dir: ${CWD}`);
  console.log(`  tools: ${ALLOW_TOOLS ? "ENABLED (pi can run tools on web text you send it)" : "off"}`);
  console.log(`\n  Bridge token (paste into the extension's settings):\n\n    ${TOKEN}\n`);
});

const shutdown = () => {
  for (const s of sessions.values()) s.kill();
  control?.kill();
  setTimeout(() => process.exit(0), 300);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
