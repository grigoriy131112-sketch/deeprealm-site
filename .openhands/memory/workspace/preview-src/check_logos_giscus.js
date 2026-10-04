// Живая проверка откликов: окно Giscus должно реально загрузиться
// (giscus.app отвечает 200) и не нарушать CSP. Окно грузится лениво,
// поэтому перед проверкой прокручиваем страницу к откликам.
const PORT = 9222;
const URL = process.argv[2] || "http://127.0.0.1:8899/logos/post/1/";
let ws, msgId = 0;
const pending = new Map();
const net = [];
const problems = [];

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
    if (m.method === "Network.responseReceived") {
      const r = m.params.response;
      if (r.url.includes("giscus.app")) net.push({ status: r.status, url: r.url });
    }
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error") {
      const text = m.params.entry.text || "";
      if (/Content Security Policy|Refused to/i.test(text)) problems.push(text);
    }
  });
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Network.enable");
  await send("Log.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280, height: 2000, deviceScaleFactor: 1, mobile: false,
  });
  await send("Page.navigate", { url: URL });
  await sleep(2500);

  const box = await ev('!!document.getElementById("giscus")');
  if (!box) problems.push("контейнер откликов не найден");

  await ev('document.getElementById("giscus").scrollIntoView({block:"center"})');
  await sleep(4000);
  await ev('window.scrollTo(0, document.body.scrollHeight)');
  await sleep(5000);

  const frame = await ev('document.querySelectorAll("iframe.giscus-frame").length');
  const script = await ev('Array.from(document.scripts).filter(s=>s.src.includes("giscus.app")).length');
  const theme = await ev(
    '(document.querySelector("iframe.giscus-frame")?.src||"").match(/theme=([^&]*)/)?.[1] || ""');

  console.log("контейнер откликов:", box);
  console.log("скрипт Giscus в DOM:", script > 0);
  console.log("окно обсуждения загрузилось:", frame > 0);
  console.log("тема окна:", theme || "—");
  console.log("ответы giscus.app:", net.length ? net.map((n) => n.status).join(", ") : "нет");
  console.log("нарушений CSP:", problems.length);
  problems.forEach((p) => console.log("   !", p.slice(0, 150)));

  if (!net.some((n) => n.status === 200)) problems.push("giscus.app не ответил 200");
  if (frame === 0) problems.push("окно обсуждения не появилось");

  console.log(problems.length ? "ИТОГ: ЕСТЬ ПРОБЛЕМЫ" : "ИТОГ: отклики работают");
  await send("Target.closeTarget", { targetId: t.id }).catch(() => {});
  ws.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error("ОШИБКА:", e.message); process.exit(1); });
