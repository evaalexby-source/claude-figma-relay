// Стартовая страница ретранслятора: генерирует личный токен в браузере и показывает
// готовые строки для плагина Figma и облачного окружения Claude Code.

// Откуда берутся установщик комплекта и скрипт окружения. В форке поменяйте на свой репозиторий.
const RAW = "https://raw.githubusercontent.com/ardubrovskij-dotcom/claude-sigma/claude/modest-brahmagupta-flhzty";
export const INSTALL_URL = `${RAW}/install.sh`;
export const SETUP_SCRIPT_URL = `${RAW}/cloud/setup.sh`;

export function landingPage(host: string, version: string): string {
  const safeHost = host.replace(/[^A-Za-z0-9.:-]/g, "");
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Claude for Figma Relay</title>
<style>
  :root { --bg:#f6f7f9; --card:#fff; --text:#0f172a; --muted:#5b6475; --line:#e3e6eb; --accent:#2563eb; --ok:#15803d; --warn:#b45309; --code:#f1f3f6; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0d1117; --card:#161b22; --text:#e6edf3; --muted:#9aa4b2; --line:#2a313c; --accent:#5b9bff; --ok:#3fb950; --warn:#d29922; --code:#1f2630; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 40px 16px 64px; }
  h1 { font-size: 28px; margin: 0 0 4px; letter-spacing: -0.01em; }
  .sub { color: var(--muted); margin: 0 0 28px; }
  .ok { color: var(--ok); font-weight: 600; }
  section { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 20px; margin: 0 0 16px; }
  h2 { font-size: 17px; margin: 0 0 4px; }
  .hint { color: var(--muted); font-size: 14px; margin: 0 0 14px; }
  .field { margin: 12px 0 0; }
  .label { font-size: 13px; color: var(--muted); margin: 0 0 6px; }
  .row { display: flex; gap: 8px; align-items: stretch; }
  code { flex: 1; min-width: 0; display: block; background: var(--code); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; font: 13px/1.4 ui-monospace, Menlo, monospace; overflow-wrap: anywhere; }
  button { font: inherit; font-size: 14px; font-weight: 600; border: 0; border-radius: 8px; padding: 0 14px; background: var(--accent); color: #fff; cursor: pointer; white-space: nowrap; }
  button.ghost { background: transparent; color: var(--accent); border: 1px solid var(--line); padding: 8px 14px; }
  ol { margin: 0; padding-left: 20px; } li { margin: 4px 0; }
  .warn { color: var(--warn); font-size: 14px; }
</style>
</head>
<body>
<main>
  <h1>Claude for Figma Relay</h1>
  <p class="sub"><span class="ok">● работает</span> · версия ${version} · ${safeHost}</p>

  <section>
    <h2>Ваш токен</h2>
    <p class="hint">Создан в этом браузере и сохранён только здесь. Кто знает адрес с токеном — может рисовать в вашей открытой Figma, поэтому храните его как пароль.</p>
    <div class="row"><code id="token">…</code><button data-copy="token">Копировать</button></div>
    <p style="margin:12px 0 0"><button class="ghost" id="regen">Создать новый токен</button> <span class="warn" id="regen-note" hidden>Старые подключения перестанут работать — обновите адрес в плагине и в окружении.</span></p>
  </section>

  <section>
    <h2>1. Плагин в Figma</h2>
    <p class="hint">Плагин Claude for Figma by Dubrovskiy → блок «Облако» → вставить адрес → галочка «авто» → «Подключить».</p>
    <div class="row"><code id="room">…</code><button data-copy="room">Копировать</button></div>
  </section>

  <section>
    <h2>2. Репозиторий</h2>
    <p class="hint">Скажите Claude в сессии нужного репозитория: «Выполни эту команду, закоммить и запушь» — и вставьте строку. Или выполните её сами в папке репозитория. Потом откройте новую сессию — облачную или на компьютере.</p>
    <div class="row"><code id="install">…</code><button data-copy="install">Копировать</button></div>
    <p class="warn" style="margin:10px 0 0">Адрес с токеном сохранится в репозитории (.claude/figma/relay-url). Для публичного репозитория используйте вариант ниже.</p>
  </section>

  <section>
    <h2>Вместо этого: облачное окружение целиком</h2>
    <p class="hint">Для публичных репозиториев или чтобы не коммитить файлы. В облачной сессии: меню окружения в заголовке сессии → Edit; действует во всех репозиториях окружения.</p>
    <div class="field">
      <p class="label">Environment variables — добавить строку</p>
      <div class="row"><code id="env">…</code><button data-copy="env">Копировать</button></div>
    </div>
    <div class="field">
      <p class="label">Network access → Allowed domains — добавить домен</p>
      <div class="row"><code id="domain">${safeHost}</code><button data-copy="domain">Копировать</button></div>
    </div>
    <div class="field">
      <p class="label">Setup script — добавить строку</p>
      <div class="row"><code id="setup">curl -fsSL ${SETUP_SCRIPT_URL} | bash</code><button data-copy="setup">Копировать</button></div>
    </div>
  </section>

  <section>
    <h2>Проверка</h2>
    <ol>
      <li>В плагине у блока «Облако» зелёная точка.</li>
      <li>Новая сессия в репозитории: «Проверь подключение к Figma».</li>
      <li>Ответ: <code style="display:inline;padding:2px 6px">connected: true</code>, <code style="display:inline;padding:2px 6px">bridge: relay</code>.</li>
    </ol>
  </section>
</main>
<script>
  const host = ${JSON.stringify(safeHost)};
  const KEY = "claude-figma-relay-token";
  function newToken() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes)).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
  }
  function load() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function save(t) { try { localStorage.setItem(KEY, t); } catch (e) {} }
  function render(token) {
    const room = "wss://" + host + "/ws/" + token;
    document.getElementById("token").textContent = token;
    document.getElementById("room").textContent = room;
    document.getElementById("env").textContent = "SIGMA_RELAY_URL=" + room;
    document.getElementById("install").textContent = "curl -fsSL ${INSTALL_URL} | bash -s -- '" + room + "'";
  }
  let token = load();
  if (!token) { token = newToken(); save(token); }
  render(token);
  document.getElementById("regen").onclick = () => {
    token = newToken(); save(token); render(token);
    document.getElementById("regen-note").hidden = false;
  };
  document.querySelectorAll("button[data-copy]").forEach((b) => {
    b.onclick = async () => {
      const text = document.getElementById(b.dataset.copy).textContent;
      try { await navigator.clipboard.writeText(text); b.textContent = "Скопировано"; }
      catch (e) { b.textContent = "Выделите и ⌘C"; }
      setTimeout(() => { b.textContent = "Копировать"; }, 1500);
    };
  });
</script>
</body>
</html>`;
}
