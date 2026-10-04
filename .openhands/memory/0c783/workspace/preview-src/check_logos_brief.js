// Проверка страницы брифа: шаблоны на месте, кнопки копирования работают,
// ссылки ведут внутрь проекта, тема переключается.
const PORT = 9222;
const BASE = process.argv[2] || "http://127.0.0.1:8899/logos/";
let ws, msgId = 0;
const pending = new Map();
const results = [];
const problems = [];

function send(m, p = {}) {
  return new Promise((res, rej) => {
    const id = ++msgId;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method: m, params: p }));
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok) => {
  results.push(name);
  if (!ok) problems.push(name);
  console.log((ok ? "  ✓ " : "  ✗ ") + name);
};

(async () => {
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    }
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error") {
      problems.push("консоль: " + (m.params.entry.text || "").slice(0, 120));
    }
  });
  const ev = (e) => send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })
    .then((r) => r.result?.value);

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Log.enable");
  await send("Network.enable");
  // Без этого браузер отдаёт style.css из кэша прошлых запусков, и проверка
  // ругается на стили, которых в файле давно нет.
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1600, deviceScaleFactor: 1, mobile: false });
  await send("Browser.grantPermissions", { permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] }).catch(() => {});

  await send("Page.navigate", { url: BASE + "brief/" });
  await sleep(2500);
  // Буфер обмена доступен только активной вкладке: без фокуса браузер
  // отклоняет и запись, и чтение.
  await send("Page.bringToFront").catch(() => {});

  check("страница брифа открылась", (await ev("location.pathname")).includes("/brief/"));
  check("заголовок страницы", (await ev("document.title")).includes("Бриф"));
  check("три шаблона на месте", (await ev("document.querySelectorAll('.brief-pre').length")) === 3);
  check("короткий шаблон: 10 пунктов",
    (await ev("(document.getElementById('brief-short').textContent.match(/^\\d+\\./gm)||[]).length")) === 10);
  check("подробный шаблон: 8 разделов",
    (await ev("(document.getElementById('brief-full').textContent.match(/^\\d+\\. /gm)||[]).length")) === 8);
  check("пример заполнения есть",
    (await ev("document.getElementById('brief-example').textContent")).includes("Марина"));
  check("кнопок копирования три",
    (await ev("document.querySelectorAll('.copy-btn').length")) === 3);

  // Копирование: без этого заказчику с телефона шаблон не перенести.
  await ev("document.querySelector('.copy-btn[data-copy=\"brief-short\"]').click()");
  await sleep(600);
  const copied = await ev("navigator.clipboard.readText().catch(() => '')");
  check("кнопка копирует текст шаблона",
    (copied || "").includes("Что за сайт"));
  check("кнопка подтверждает копирование",
    (await ev("document.querySelector('.copy-btn[data-copy=\"brief-short\"]').textContent")).includes("Скопировано"));

  // Ссылки должны вести внутрь проекта — иначе на Pages будет 404.
  const badLinks = await ev(`Array.from(document.querySelectorAll('a[href]'))
    .map(a => a.getAttribute('href'))
    .filter(h => h.startsWith('/') && !h.startsWith('/logos/'))`);
  check("нет ссылок мимо проекта", badLinks.length === 0);
  check("ссылка на Telegram есть",
    await ev("!!document.querySelector('a[href*=\"t.me/vebfabric\"]')"));

  // Ссылка в навигации на месте и ведёт сюда же.
  check("в меню есть «Заказать сайт»",
    await ev(`Array.from(document.querySelectorAll('.nav a')).some(a => a.textContent.includes('Заказать сайт'))`));

  // Тема
  const before = await ev("document.documentElement.dataset.theme");
  await ev("document.getElementById('theme-toggle').click()");
  await sleep(400);
  const after = await ev("document.documentElement.dataset.theme");
  check("тема переключается", before !== after);
  check("текст шаблона читается в тёмной теме",
    (await ev("getComputedStyle(document.querySelector('.brief-pre')).backgroundColor")) !== "rgba(0, 0, 0, 0)");

  await send("Target.closeTarget", { targetId: t.id }).catch(() => {});
  ws.close();
  console.log(`\n  итого: ${results.length - problems.length}/${results.length} пройдено`);
  if (problems.length) {
    console.log("  проблемы:");
    problems.forEach((p) => console.log("   -", p));
  }
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error("ОШИБКА:", e.message); process.exit(1); });
