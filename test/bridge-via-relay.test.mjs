// Мост в облачном режиме (SIGMA_RELAY_URL) ⇄ ретранслятор ⇄ имитация плагина.
// Нужен запущенный ретранслятор: `npx wrangler dev` (или RELAY_URL=wss://…workers.dev).
import assert from "node:assert";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import WebSocket from "ws";

const BASE = (process.env.RELAY_URL || "ws://127.0.0.1:8787").replace(/\/$/, "");
const ROOM = `${BASE}/ws/bridge-test-${Date.now()}-abcdefghijkl`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (r) => r.content.find((c) => c.type === "text").text;

async function bridge(relayUrl) {
  const client = new Client({ name: "cloud-session", version: "1" });
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [new URL("../../bridge/mcpb/server/index.js", import.meta.url).pathname],
    env: { ...process.env, SIGMA_RELAY_URL: relayUrl },
    stderr: "pipe",
  }));
  const call = (name, args = {}) => client.callTool({ name, arguments: args });
  return { client, call, status: async () => JSON.parse(text(await call("figma_status"))) };
}
async function until(fn, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await fn(); if (v) return v; await wait(200); }
  throw new Error("timeout");
}

// Неверный адрес комнаты — понятная подсказка
const bad = await bridge(`${BASE}/ws/short`);
const badStatus = await until(async () => { const s = await bad.status(); return s.hint.includes("неверный адрес") && s; });
assert.equal(badStatus.connected, false);
await bad.client.close();

const b = await bridge(ROOM);
let s = await until(async () => { const st = await b.status(); return st.bridge === "relay" && st; });
assert.equal(s.connected, false); assert(s.hint.includes("Плагин не подключён к облачному ретранслятору"), s.hint);

// Плагин подключается к той же комнате
const plugin = new WebSocket(ROOM, { origin: "null" });
await new Promise((r) => plugin.on("open", r));
plugin.send(JSON.stringify({ type: "hello", role: "figma-plugin" }));
plugin.on("message", (raw) => {
  const m = JSON.parse(String(raw));
  if (!m.command) return;
  if (m.command === "slow") return;
  const result = m.command === "get_document_info" ? { file: "Cloud deck" }
    : m.command === "batch" ? { results: m.params.commands.map((c, i) => ({ id: "9:" + i, command: c.command })) }
    : m.command === "get_selection" ? [{ id: "9:0" }]
    : m.command === "export_node" ? { format: "PNG", base64: "iVBORw0KGgo=", bytes: 8 } : {};
  plugin.send(JSON.stringify({ type: "result", id: m.id, result }));
});

s = await until(async () => { const st = await b.status(); return st.connected && st; });
assert.deepEqual(s, { connected: true, bridge: "relay", file: "Cloud deck" });

const r = await b.call("figma_batch", { commands: [{ command: "create_frame" }, { command: "create_text", params: { parentId: "$0" } }] });
assert(!r.isError); assert.equal(JSON.parse(text(r)).results.length, 2);
const shot = await b.call("figma_screenshot");
assert.equal(shot.content[0].type, "image");

// Плагин уходит во время команды — ошибка сразу, без 30-секундного ожидания
const t0 = Date.now();
const pending = b.call("figma_command", { command: "slow" });
await wait(300);
plugin.close();
const pr = await pending;
assert(pr.isError && text(pr).includes("отключился"), text(pr));
assert(Date.now() - t0 < 5000, "ошибка пришла быстро");

await b.client.close();
console.log("BRIDGE VIA RELAY OK:", BASE);
process.exit(0);
