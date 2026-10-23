// Claude for Figma Relay — ретранслятор между облачными сессиями Claude и плагином Figma.
//
// Адрес комнаты: wss://<хост>/ws/<токен>. Токен — секрет: кто его знает, тот рисует в вашей Figma.
// В комнате один плагин (role "figma-plugin") и сколько угодно мостов (остальные роли).
// Мост шлёт { id, command, params } → плагину уходит id "<cid>:<id>", где cid — метка моста;
// ответ плагина по этой метке возвращается нужному мосту. Состояние хранится в метках
// сокетов (serializeAttachment), поэтому объект может «засыпать» (WebSocket Hibernation)
// и ничего не стоит, пока команд нет.

import { landingPage } from "./page";

const VERSION = "0.2.0";
const ROOM_RE = /^\/ws\/([A-Za-z0-9_-]{24,128})$/;
const NO_PLUGIN =
  "Плагин не подключён к облачному ретранслятору. В Figma: плагин Claude for Figma by Dubrovskiy → блок «Облако» → " +
  "вставьте адрес комнаты и нажмите «Подключить».";

type Role = "plugin" | "bridge";
type Attachment = { role: Role | null; cid: string };

export interface Env {
  ROOMS: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const room = ROOM_RE.exec(url.pathname);
    if (room) return env.ROOMS.get(env.ROOMS.idFromName(room[1])).fetch(request);
    if (url.pathname === "/") {
      return new Response(landingPage(url.host, VERSION), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }
    if (url.pathname === "/health") return Response.json({ ok: true, version: VERSION });
    return new Response("Not found", { status: 404 });
  },
};

export class Room {
  constructor(private ctx: DurableObjectState) {
    // Keep-alive без пробуждения объекта.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'));
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Нужно WebSocket-подключение", { status: 426 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ role: null, cid: crypto.randomUUID().slice(0, 8) } satisfies Attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    let msg: any;
    try {
      msg = JSON.parse(typeof data === "string" ? data : new TextDecoder().decode(data));
    } catch {
      return;
    }
    const att = ws.deserializeAttachment() as Attachment;

    if (msg.type === "hello") {
      const role: Role = msg.role === "figma-plugin" ? "plugin" : "bridge";
      if (role === "plugin") {
        for (const old of this.sockets("plugin")) if (old !== ws) old.close(4000, "replaced");
      }
      ws.serializeAttachment({ ...att, role } satisfies Attachment);
      const who = role === "plugin" ? "плагин" : "мост";
      ws.send(JSON.stringify({ type: "welcome", message: `Claude for Figma Relay ${VERSION}: ${who} подключён` }));
      return;
    }

    if (att.role === "bridge" && msg.command && msg.id !== undefined) {
      const plugin = this.sockets("plugin")[0];
      if (!plugin) {
        ws.send(JSON.stringify({ type: "result", id: msg.id, error: NO_PLUGIN }));
        return;
      }
      plugin.send(JSON.stringify({ id: `${att.cid}:${msg.id}`, command: msg.command, params: msg.params ?? {} }));
      return;
    }

    if (att.role === "plugin" && msg.type === "result") {
      const full = String(msg.id);
      const sep = full.indexOf(":");
      if (sep < 0) return;
      const cid = full.slice(0, sep);
      const bridge = this.sockets("bridge").find((b) => (b.deserializeAttachment() as Attachment).cid === cid);
      bridge?.send(JSON.stringify({ type: "result", id: full.slice(sep + 1), result: msg.result, error: msg.error }));
    }
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment | null;
    // Плагин ушёл — мосты сразу отменяют ожидающие команды, а не ждут таймаута.
    if (att?.role === "plugin" && !this.sockets("plugin").some((p) => p !== ws)) {
      for (const b of this.sockets("bridge")) b.send(JSON.stringify({ type: "plugin-gone" }));
    }
    try {
      ws.close(code === 1005 ? 1000 : code, "closed");
    } catch {
      // уже закрыт
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws, 1011);
  }

  private sockets(role: Role): WebSocket[] {
    return this.ctx.getWebSockets().filter((w) => {
      const a = w.deserializeAttachment() as Attachment | null;
      return a?.role === role && w.readyState === WebSocket.OPEN;
    });
  }
}
