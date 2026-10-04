// Измеряет, при какой ширине меню перестаёт помещаться в шапку.
const PORT = 9222;
const URL = process.argv[2] || "http://127.0.0.1:8899/logos/brief/";
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
  await send("Page.navigate", { url: URL });
  await sleep(2200);

  for (const w of [768, 820, 860, 900, 940, 980, 1024, 1100, 1280]) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(350);
    const r = await ev(`(() => {
      const doc = document.documentElement;
      const nav = document.querySelector('.nav');
      const brand = document.querySelector('.brand');
      return JSON.stringify({
        cw: doc.clientWidth,
        overflow: doc.scrollWidth - doc.clientWidth,
        navW: Math.round(nav.getBoundingClientRect().width),
        brandW: Math.round(brand.getBoundingClientRect().width),
        navRight: Math.round(nav.getBoundingClientRect().right)
      });
    })()`);
    console.log("  " + w + ": " + r);
  }
  await send("Target.closeTarget", { targetId: t.id }).catch(() => {});
  ws.close();
  process.exit(0);
})().catch((e) => { console.error("ОШИБКА:", e.message); process.exit(1); });
