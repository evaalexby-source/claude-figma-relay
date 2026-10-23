// Облачная цепочка: MCP-клиент (облачная сессия) → мост с SIGMA_RELAY_URL → ретранслятор (wrangler dev) →
// ui.html в Chromium (блок «Облако») → dist/code.js плагина поверх заглушки figma.*.
// Нужен запущенный ретранслятор: `npx wrangler dev` (или RELAY_URL=wss://…workers.dev).
import assert from "node:assert";
import fs from "node:fs";
import { chromium } from "playwright-core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const BASE = (process.env.RELAY_URL || "ws://127.0.0.1:8787").replace(/\/$/, "");
const ROOM = `${BASE}/ws/e2e-cloud-${Date.now()}-abcdefghijk`;
const root = new URL("../../figma-plugin/", import.meta.url);
const uiHtml = fs.readFileSync(new URL("ui.html", root), "utf8");
const pluginCode = fs.readFileSync(new URL("dist/code.js", root), "utf8");

const mockFigma = `
  let nextId = 1; const nodes = new Map();
  const mixed = Symbol("mixed");
  function base(type) {
    const n = { id: "1:" + nextId++, type, name: type, x: 0, y: 0, width: 100, height: 100, visible: true, removed: false,
      fills: [], strokes: [], parent: null,
      resize(w, h) { this.width = w; this.height = h; },
      remove() { const p = this.parent; p.children.splice(p.children.indexOf(this), 1); this.removed = true; nodes.delete(this.id); },
      async exportAsync() { return new Uint8Array([137, 80, 78, 71]); } };
    nodes.set(n.id, n); return n;
  }
  function container(n) { n.children = []; n.appendChild = (c) => { if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1); c.parent = n; n.children.push(c); };
    n.insertChild = (i, c) => n.appendChild(c); n.findAll = () => []; return n; }
  const page = container({ id: "0:1", type: "PAGE", name: "Page 1", selection: [] });
  window.__html__ = "";
  window.figma = {
    mixed, editorType: "figma", root: { name: "E2E deck", children: [page] }, currentPage: page,
    showUI() {}, notify() {}, viewport: { scrollAndZoomIntoView() {} },
    base64Encode: (bytes) => btoa(String.fromCharCode(...bytes)),
    ui: { postMessage(m) { document.getElementById("ui").contentWindow.postMessage({ pluginMessage: m }, "*"); }, onmessage: null },
    clientStorage: { async getAsync() { return { url: "ws://localhost:3055", auto: false, cloudUrl: "${ROOM}", cloudAuto: true }; }, async setAsync() {} },
    async getNodeByIdAsync(id) { return id === page.id ? page : nodes.get(id) || null; },
    async loadFontAsync() {}, async loadAllPagesAsync() {},
    createFrame() { const n = container(base("FRAME")); n.layoutMode = "NONE"; n.cornerRadius = 0; n.effects = []; n.clipsContent = true; return n; },
    createRectangle() { const n = base("RECTANGLE"); n.cornerRadius = 0; return n; },
    createEllipse() { return base("ELLIPSE"); },
    createText() { const n = base("TEXT"); n.characters = ""; n.fontName = { family: "Inter", style: "Regular" }; n.fontSize = 12; n.textAutoResize = "WIDTH_AND_HEIGHT"; return n; },
  };
  window.addEventListener("message", (e) => { const m = e.data && e.data.pluginMessage; if (m) figma.ui.onmessage(m); });
`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage();
const logs = [];
page.on("console", (m) => logs.push(m.text()));
await page.setContent(`<!doctype html><body><iframe id="ui" sandbox="allow-scripts" style="width:380px;height:560px"></iframe></body>`);
await page.evaluate(mockFigma);
await page.evaluate(pluginCode); // как в Figma: сначала code.js, затем showUI загружает ui.html
await page.$eval("#ui", (f, html) => { f.srcdoc = html; }, uiHtml); // UI загрузит настройки и подключится сам

const client = new Client({ name: "e2e", version: "1" });
await client.connect(new StdioClientTransport({
  command: process.execPath,
  args: [new URL("../../bridge/mcpb/server/index.js", import.meta.url).pathname],
  env: { ...process.env, SIGMA_RELAY_URL: ROOM },
  stderr: "pipe",
}));
const call = async (name, args = {}) => client.callTool({ name, arguments: args });
const text = (r) => r.content.find((c) => c.type === "text").text;

let status;
for (let i = 0; i < 40; i++) {
  status = JSON.parse(text(await call("figma_status")));
  if (status.connected) break;
  await page.waitForTimeout(250);
}
if (!status.connected) console.error("UI LOG:", await page.frameLocator("#ui").locator("#log").innerText(), logs);
assert.equal(status.connected, true, "плагин подключился к мосту: " + JSON.stringify(status));
assert.equal(status.file, "E2E deck");

const r = await call("figma_batch", { commands: [
  { command: "create_frame", params: { name: "Slide 01", width: 1920, height: 1080, fill: { type: "linear", stops: ["#0F172A", "#1E293B"], angle: 90 } } },
  { command: "create_text", params: { parentId: "$0", text: "Заголовок", x: 120, y: 120, width: 1200, fontStyle: "Bold", fontSize: 96, fill: "#F8FAFC" } },
  { command: "select", params: { ids: ["$0"] } },
] });
assert(!r.isError, text(r));
const [frame, title] = JSON.parse(text(r)).results;
assert.equal(frame.width, 1920); assert.equal(title.width, 1200);

const tree = JSON.parse(text(await call("figma_command", { command: "get_node", params: { id: frame.id, depth: 1 } })));
assert.equal(tree.children[0].characters, "Заголовок");

const shot = await call("figma_screenshot", { id: frame.id });
assert.equal(shot.content[0].type, "image"); assert.equal(shot.content[0].data, "iVBORw==");

const uiLog = await page.frameLocator("#ui").locator("#log").innerText();
assert(uiLog.includes("Подключено к " + ROOM.replace(/(\/ws\/.{4}).*/, "$1…")), uiLog);
assert(!uiLog.includes(ROOM.split("/ws/")[1]), "токен не виден в логе");
assert(/✓ Облако \w+:c\d+/.test(uiLog), "команды из облака видны в логе плагина: " + uiLog);
assert.equal(status.bridge, "relay");

await client.close();
await browser.close();
console.log("E2E CLOUD OK:", BASE);
process.exit(0);
