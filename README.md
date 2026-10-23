# Claude for Figma Relay

Ретранслятор на Cloudflare Workers: позволяет облачным сессиям Claude Code рисовать в Figma на вашем компьютере.

```
облачная сессия ── мост (SIGMA_RELAY_URL) ──► wss://<ретранслятор>/ws/<токен> ◄── плагин в Figma (блок «Облако»)
```

- Комната = токен. Кто знает адрес с токеном, тот может рисовать в вашей открытой Figma — храните его как пароль.
- В комнате один плагин и сколько угодно мостов (несколько облачных сессий одновременно).
- Durable Object «засыпает», пока нет команд (WebSocket Hibernation) — укладывается в бесплатный тариф.

## Развёртывание

**Кнопкой** (нужен публичный репозиторий):

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/ardubrovskij-dotcom/claude-sigma/tree/claude/modest-brahmagupta-flhzty/relay)

**Вручную** (Node.js на компьютере):

```bash
cd relay
npm install
npx wrangler login     # вход в аккаунт Cloudflare в браузере
npx wrangler deploy    # выведет адрес https://claude-figma-relay.<имя>.workers.dev
```

Откройте выведенный адрес в браузере: стартовая страница создаст личный токен и покажет строки для плагина и облачного окружения.

## Проверка

```bash
npx wrangler dev                                              # локальный ретранслятор на :8787
npm test                                                      # протокол комнат
node test/bridge-via-relay.test.mjs                           # мост в облачном режиме
node test/e2e-cloud.test.mjs                                  # мост → ретранслятор → ui.html в Chromium → плагин
RELAY_URL=wss://claude-figma-relay.<имя>.workers.dev npm test # проверить развёрнутый
```

## Протокол

| Кто → кому | Сообщение |
|---|---|
| любой → ретранслятор | `{ type: "hello", role }` — `figma-plugin` для плагина, иное — мост; ответ `{ type: "welcome" }` |
| мост → плагин | `{ id, command, params }` (плагин получает `id` с меткой моста `"<cid>:<id>"`) |
| плагин → мост | `{ type: "result", id, result \| error }` |
| ретранслятор → мост | `{ type: "result", id, error }` если плагина нет; `{ type: "plugin-gone" }` когда плагин ушёл |
| любой ↔ ретранслятор | `{ type: "ping" }` → `{ type: "pong" }` (без пробуждения объекта) |

Новый плагин в той же комнате вытесняет старый (код закрытия 4000).
