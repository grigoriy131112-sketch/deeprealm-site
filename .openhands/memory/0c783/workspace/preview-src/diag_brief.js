// Диагностика страницы брифа: что происходит при клике по копированию.
const PORT = 9222;
const BASE = process.argv[2] || "http://127.0.0.1:8899/logos/";
let ws, msgId = 0;
const pending = new Map();
function send(m, p = {}) {
  return new Promise((res, rej) => {
    const id = ++msgId;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method: m, params: p }));
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
    if (m.method === "Log.entryAdded") console.log("  [консоль]", m.params.entry.level, (m.params.entry.text || "").slice(0, 160));
  });
  const ev = (e) => send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })
    .then((r) => r.result?.value);

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Log.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1600, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: BASE + "brief/" });
  await sleep(2500);

  console.log("brief.js выполнился (обработчики навешены):",
    await ev("document.querySelector('.copy-btn').onclick !== null || true"));
  console.log("navigator.clipboard доступен:", await ev("!!navigator.clipboard"));
  console.log("secure context:", await ev("window.isSecureContext"));
  console.log("CSS .brief-pre фон:", await ev("getComputedStyle(document.querySelector('.brief-pre')).backgroundColor"));
  console.log("CSS .brief-pre цвет:", await ev("getComputedStyle(document.querySelector('.brief-pre')).color"));

  console.log("--- клик по кнопке ---");
  await ev("document.querySelector('.copy-btn[data-copy=\"brief-short\"]').click()");
  await sleep(900);
  console.log("текст кнопки:", await ev("document.querySelector('.copy-btn[data-copy=\"brief-short\"]').textContent.trim()"));
  console.log("readText:", JSON.stringify(await ev("navigator.clipboard.readText().then(t=>t.slice(0,60)).catch(e=>'ОШИБКА: '+e.name)")));

  await send("Target.closeTarget", { targetId: t.id }).catch(() => {});
  ws.close();
  process.exit(0);
})().catch((e) => { console.error("ОШИБКА:", e.message); process.exit(1); });
