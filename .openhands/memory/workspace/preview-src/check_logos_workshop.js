// Проверка мастерской «Логоса» в настоящем браузере:
// псевдоним, свои мысли, правка, удаление, копия данных, сохранность
// между перезагрузками. Запуск: node preview-src/check_logos_workshop.js [адрес]
const PORT = 9222;
const BASE = process.argv[2] || "http://127.0.0.1:8899/logos/workshop/";

let ws, msgId = 0;
const pending = new Map();
const consoleErrors = [];

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function connect() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" });
  const target = await res.json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    }
    if (m.method === "Runtime.exceptionThrown") {
      const d = m.params.exceptionDetails;
      consoleErrors.push(d.exception?.description || d.text || "исключение");
    }
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error") {
      consoleErrors.push(m.params.entry.text);
    }
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
      consoleErrors.push(m.params.args.map((a) => a.value || a.description).join(" "));
    }
  });
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Log.enable");
  return target;
}

async function visit(url) {
  consoleErrors.length = 0;
  const loaded = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("load timeout: " + url)), 40000);
    const handler = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.method === "Page.loadEventFired") {
        clearTimeout(t);
        ws.removeEventListener("message", handler);
        resolve();
      }
    };
    ws.addEventListener("message", handler);
  });
  await send("Page.navigate", { url });
  await loaded;
}

async function evalJs(expression) {
  const r = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || "ошибка вычисления");
  }
  return r.result.value;
}

const checks = [];
const check = (name, ok) => checks.push([name, Boolean(ok)]);

async function main() {
  await connect();

  // Начинаем с чистого листа: мастерская хранит данные в localStorage.
  await visit(BASE);
  await evalJs("localStorage.removeItem('logos-workshop'); true");
  await visit(BASE);

  check("мастерская открылась", await evalJs("!!document.getElementById('workshop')"));
  check("сначала просят псевдоним", await evalJs(
    "!document.getElementById('ws-setup').hidden && document.getElementById('ws-profile').hidden"));
  check("публикация в статике недоступна",
    (await evalJs("document.getElementById('workshop').dataset.canPublish")) === "false");

  // Профиль.
  await evalJs(`
    document.getElementById('ws-setup-form').nick.value = 'Ночной читатель';
    document.getElementById('ws-setup-form').about.value = 'Пишу о книгах';
    document.getElementById('ws-setup-form').dispatchEvent(new Event('submit', {cancelable:true}));
    true`);
  check("профиль создан", await evalJs(
    "document.getElementById('ws-profile').hidden === false && document.getElementById('ws-setup').hidden === true"));
  check("псевдоним виден", (await evalJs("document.getElementById('ws-nick').textContent")) === "Ночной читатель");
  check("аватар из первой буквы", (await evalJs("document.getElementById('ws-avatar').textContent")) === "Н");

  // Первая мысль.
  await evalJs(`
    document.getElementById('ws-new').click();
    const f = document.getElementById('ws-form');
    f.title.value = 'Мысль о тишине';
    f.tags.value = 'философия, наблюдения';
    f.summary.value = 'Коротко о главном';
    f.body.value = 'Первый абзац с **важным** словом.\\n\\n- пункт один\\n- пункт два';
    f.dispatchEvent(new Event('submit', {cancelable:true}));
    true`);
  check("мысль сохранена", (await evalJs("document.querySelectorAll('#ws-list .post-card').length")) === 1);
  check("счётчик мыслей", (await evalJs("document.getElementById('ws-stat-posts').textContent")) === "1");
  check("счётчик тем", (await evalJs("document.getElementById('ws-stat-tags').textContent")) === "2");
  check("редактор закрылся", await evalJs("document.getElementById('ws-editor').hidden"));

  // Markdown и чтение.
  await evalJs("document.querySelector('#ws-list .btn-ghost').click(); true");
  check("текст показывается", await evalJs("document.querySelector('.ws-body').hidden === false"));
  check("Markdown отрисован", await evalJs(
    "!!document.querySelector('.ws-body strong') && !!document.querySelector('.ws-body li')"));
  check("тег виден", (await evalJs("document.querySelector('#ws-list .tag').textContent")) === "#философия");

  // Правка.
  await evalJs(`
    const btns = Array.from(document.querySelectorAll('#ws-list .btn-ghost'));
    btns.find((b) => b.textContent === 'Изменить').click();
    true`);
  check("форма правки заполнена",
    (await evalJs("document.getElementById('ws-form').title.value")) === "Мысль о тишине");
  check("заголовок редактора — правка",
    (await evalJs("document.getElementById('ws-editor-title').textContent")) === "Правка мысли");
  await evalJs(`
    const f = document.getElementById('ws-form');
    f.title.value = 'Мысль о тишине (правка)';
    f.dispatchEvent(new Event('submit', {cancelable:true}));
    true`);
  check("правка применена", await evalJs(
    "document.querySelector('#ws-list h3').textContent === 'Мысль о тишине (правка)'"));
  check("отметка об изменении", await evalJs(
    "document.querySelector('#ws-list .post-meta').textContent.includes('изменено')"));

  // Вторая мысль — проверяем порядок и удаление.
  await evalJs(`
    document.getElementById('ws-new').click();
    const f = document.getElementById('ws-form');
    f.title.value = 'Вторая мысль';
    f.body.value = 'Текст второй мысли, достаточно длинный.';
    f.dispatchEvent(new Event('submit', {cancelable:true}));
    true`);
  check("две мысли", (await evalJs("document.querySelectorAll('#ws-list .post-card').length")) === 2);
  check("новая мысль сверху",
    (await evalJs("document.querySelector('#ws-list h3').textContent")) === "Вторая мысль");

  // Сохранность между перезагрузками.
  await visit(BASE);
  check("мысли пережили перезагрузку",
    (await evalJs("document.querySelectorAll('#ws-list .post-card').length")) === 2);
  check("псевдоним пережил перезагрузку",
    (await evalJs("document.getElementById('ws-nick').textContent")) === "Ночной читатель");

  // Удаление.
  await evalJs(`
    window.confirm = () => true;
    const cards = Array.from(document.querySelectorAll('#ws-list .post-card'));
    const card = cards.find((c) => c.querySelector('h3').textContent === 'Вторая мысль');
    Array.from(card.querySelectorAll('button')).find((b) => b.textContent === 'Удалить').click();
    true`);
  check("мысль удалена", (await evalJs("document.querySelectorAll('#ws-list .post-card').length")) === 1);
  check("осталась нужная мысль", await evalJs(
    "document.querySelector('#ws-list h3').textContent === 'Мысль о тишине (правка)'"));

  // Смена псевдонима.
  await evalJs(`
    document.getElementById('ws-edit-profile').click();
    const f = document.getElementById('ws-profile-form');
    f.nick.value = 'Пётр';
    f.dispatchEvent(new Event('submit', {cancelable:true}));
    true`);
  check("псевдоним изменён", (await evalJs("document.getElementById('ws-nick').textContent")) === "Пётр");

  // Пустая мастерская: удаляем последнюю мысль.
  await evalJs(`
    window.confirm = () => true;
    Array.from(document.querySelectorAll('#ws-list button')).find((b) => b.textContent === 'Удалить').click();
    true`);
  check("пустая мастерская показывает подсказку", await evalJs(
    "document.getElementById('ws-empty').hidden === false"));

  // Проверка XSS: в тексте не должно выполняться ничего лишнего.
  await evalJs(`
    document.getElementById('ws-new').click();
    const f = document.getElementById('ws-form');
    f.title.value = 'Проверка <script>alert(1)<\\/script>';
    f.body.value = 'Текст с <img src=x onerror=alert(1)> и <b>тегом</b>.';
    f.dispatchEvent(new Event('submit', {cancelable:true}));
    true`);
  check("опасный HTML не стал разметкой", await evalJs(
    "!document.querySelector('#ws-list img') && !document.querySelector('#ws-list script')"));
  check("текст показан как есть", await evalJs(
    "document.querySelector('#ws-list h3').textContent.includes('<script>')"));

  await send("Page.close");
  ws.close();

  let ok = true;
  for (const [name, passed] of checks) {
    console.log(("  " + (passed ? "OK  " : "СБОЙ") + " " + name));
    ok = ok && passed;
  }
  console.log("\n  итого: " + checks.filter(([, p]) => p).length + "/" + checks.length + " пройдено");
  console.log("  ошибок консоли: " + consoleErrors.length);
  if (consoleErrors.length) console.log("   ", consoleErrors.slice(0, 5).join("\n    "));
  return ok ? 0 : 1;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error("Ошибка проверки:", err.message);
  process.exit(1);
});
