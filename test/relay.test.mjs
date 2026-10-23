// Тест протокола ретранслятора. Запуск: `npx wrangler dev` в одном окне, `npm test` в другом
// (или RELAY_URL=wss://<ваш-воркер>.workers.dev для проверки развёрнутого).
import assert from "node:assert";
import WebSocket from "ws";

const BASE = (process.env.RELAY_URL || "ws://127.0.0.1:8787").replace(/\/$/, "");
const HTTP = BASE.replace(/^ws/, "http");
const room = (s) => `${BASE}/ws/${s}${"x".repeat(Math.max(0, 24 - s.length))}`;
const R1 = room("room-one-" + Date.now());
const R2 = room("room-two-" + Date.now());

function client(url, role) {
  const ws = new WebSocket(url, role === "figma-plugin" ? { origin: "null" } : {});
  const inbox = [];
  const waiters = [];
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    const i = waiters.findIndex((w) => w.pred(m));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(m);
    else inbox.push(m);
  });
  const next = (pred = () => true, ms = 5000) => {
    const i = inbox.findIndex(pred);
    if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const w = { pred, resolve };
      waiters.push(w);
      setTimeout(() => reject(new Error("нет сообщения за " + ms + " мс")), ms);
    });
  };
  const opened = new Promise((res, rej) => { ws.on("open", res); ws.on("error", rej); });
  const closed = new Promise((res) => ws.on("close", (code) => res(code)));
  const hello = async () => { await opened; ws.send(JSON.stringify({ type: "hello", role })); return next((m) => m.type === "welcome"); };
  return { ws, next, hello, closed, send: (o) => ws.send(JSON.stringify(o)) };
}

// HTTP-маршруты
assert.equal((await fetch(HTTP + "/health")).status, 200);
assert.equal((await fetch(HTTP + "/ws/short")).status, 404, "короткий токен отклоняется");
assert.equal((await fetch(R1.replace(/^ws/, "http"))).status, 426, "без WebSocket — 426");
const page = await (await fetch(HTTP + "/")).text();
assert(page.includes("SIGMA_RELAY_URL") && page.includes("setup.sh"), "стартовая страница");

// Мост без плагина — понятная ошибка
const b1 = client(R1, "bridge-relay");
assert((await b1.hello()).message.includes("мост"));
b1.send({ id: "c1", command: "ping" });
const noPlugin = await b1.next((m) => m.type === "result");
assert.equal(noPlugin.id, "c1"); assert(noPlugin.error.includes("Плагин не подключён"));

// Плагин подключается, отвечает на команды двух мостов
const plugin = client(R1, "figma-plugin");
assert((await plugin.hello()).message.includes("плагин"));
let seen = 0;
plugin.ws.on("message", (raw) => {
  const m = JSON.parse(String(raw));
  if (!m.command) return;
  seen++;
  plugin.send({ type: "result", id: m.id, result: { echo: m.params.n } });
});
const b2 = client(R1, "bridge-relay");
await b2.hello();
for (let i = 0; i < 5; i++) { b1.send({ id: "c" + (10 + i), command: "probe", params: { n: "b1-" + i } }); b2.send({ id: "c" + (10 + i), command: "probe", params: { n: "b2-" + i } }); }
for (let i = 0; i < 5; i++) {
  assert.equal((await b1.next((m) => m.id === "c" + (10 + i))).result.echo, "b1-" + i);
  assert.equal((await b2.next((m) => m.id === "c" + (10 + i))).result.echo, "b2-" + i);
}
assert.equal(seen, 10);

// Другая комната изолирована
const other = client(R2, "bridge-relay");
await other.hello();
other.send({ id: "c1", command: "probe", params: { n: 1 } });
assert((await other.next((m) => m.type === "result")).error.includes("Плагин не подключён"), "плагин чужой комнаты не виден");

// Keep-alive отвечает без пробуждения объекта
b1.send({ type: "ping" });
assert.equal((await b1.next((m) => m.type === "pong")).type, "pong");

// Второй плагин вытесняет первый
const plugin2 = client(R1, "figma-plugin");
await plugin2.hello();
assert.equal(await plugin.closed, 4000, "старый плагин закрыт с кодом 4000");

// Плагин ушёл — мосты узнают сразу
plugin2.ws.close();
assert.equal((await b1.next((m) => m.type === "plugin-gone")).type, "plugin-gone");
assert.equal((await b2.next((m) => m.type === "plugin-gone")).type, "plugin-gone");

for (const c of [b1, b2, other]) c.ws.close();
console.log("RELAY OK:", BASE);
process.exit(0);
