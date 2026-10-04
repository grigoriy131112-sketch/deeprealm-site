// Диагностика: какой элемент переполняет ширину на планшете 820.
const PORT = 9222;
const URL = process.argv[2] || "http://127.0.0.1:8899/logos/workshop/";
let ws, id = 0;
const pending = new Map();
function send(m, p = {}) {
  return new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
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
  });
  const ev = (e) => send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })
    .then((r) => r.result?.value);
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 820, height: 1200, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: URL });
  await sleep(2500);

  const out = await ev(`(() => {
    const doc = document.documentElement;
    const cw = doc.clientWidth;
    const all = Array.from(document.querySelectorAll('body *'));
    const over = all.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.right > cw + 1;
    }).map((el) => ({
      tag: el.tagName,
      cls: (el.className || '').toString().slice(0, 50),
      id: el.id || '',
      right: Math.round(el.getBoundingClientRect().right),
      width: Math.round(el.getBoundingClientRect().width),
      scrollW: el.scrollWidth,
      text: (el.textContent || '').trim().slice(0, 40),
    }));
    return JSON.stringify({ clientWidth: cw, scrollWidth: doc.scrollWidth, overflow: doc.scrollWidth - cw, over: over.slice(0, 12) }, null, 1);
  })()`);
  console.log(out);
  await send("Target.closeTarget", { targetId: t.id }).catch(() => {});
  ws.close();
  process.exit(0);
})().catch((e) => { console.error("ОШИБКА:", e.message); process.exit(1); });
