// Диагностика: показать дерево фреймов страницы публикации.
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    }
  });
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.navigate", { url: URL });
  await sleep(7000);
  const tree = await send("Page.getFrameTree");
  (function walk(n, d = 0) {
    if (!n) return;
    console.log(" ".repeat(d) + "[" + n.frame.id + "] " + n.frame.url.slice(0, 90));
    (n.childFrames || []).forEach((c) => walk(c, d + 2));
  })(tree.frameTree);
  await send("Target.closeTarget", { targetId: t.id }).catch(() => {});
  ws.close();
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
