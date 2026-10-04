// Диагностика страницы публикации: контейнер откликов, скрипт Giscus, фрейм.
const PORT = 9222;
const URL = process.argv[2] || "http://127.0.0.1:8899/logos/post/1/";
let ws, msgId = 0;
const pending = new Map();
function send(m, p = {}) {
  return new Promise((res, rej) => {
    const id = ++msgId;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method: m, params: p }));
  });
}
const ev = (e) => send("Runtime.evaluate", { expression: e, returnByValue: true }).then((r) => r.result?.value);
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
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.navigate", { url: URL });
  await sleep(3000);
  console.log("контейнер #giscus:", await ev('!!document.getElementById("giscus")'));
  console.log("разметка контейнера:", (await ev('(document.getElementById("giscus")||{}).outerHTML||"—").slice(0, 260)'));
  console.log("скрипт giscus.app в DOM:", await ev('Array.from(document.scripts).filter(s=>s.src.includes("giscus")).map(s=>s.src).join(",")'));
  console.log("фрейм giscus:", await ev('document.querySelectorAll("iframe").length'));
  console.log("giscus.js подключён на странице:", await ev('Array.from(document.scripts).some(s=>s.src.includes("giscus.js"))'));
  await sleep(3000);
  console.log("--- через 6 c ---");
  console.log("скрипт giscus.app в DOM:", await ev('Array.from(document.scripts).filter(s=>s.src.includes("giscus.app")).length'));
  console.log("фреймов:", await ev('document.querySelectorAll("iframe").length'));
  console.log("ошибок в консоли:", await ev('window.__errCount||0'));
  await send("Target.closeTarget", { targetId: t.id }).catch(() => {});
  ws.close();
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
