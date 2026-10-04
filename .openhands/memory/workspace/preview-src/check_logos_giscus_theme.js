// Проверка темы окна откликов. Окно Giscus — отдельный процесс
// (cross-origin), поэтому в дереве фреймов страницы его нет: ищем его
// среди целей браузера и читаем оформление уже внутри него.
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

function rpc(url, method, params = {}) {
  return new Promise((resolve, reject) => {
    const s = new WebSocket(url);
    s.addEventListener("open", () => s.send(JSON.stringify({ id: 1, method, params })));
    s.addEventListener("message", (e) => {
      const m = JSON.parse(e.data);
      if (m.id === 1) {
        s.close();
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      }
    });
    s.addEventListener("error", () => reject(new Error("не подключиться: " + url)));
  });
}

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
  const ev = (e) => send("Runtime.evaluate", { expression: e, returnByValue: true }).then((r) => r.result?.value);

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280, height: 2000, deviceScaleFactor: 1, mobile: false,
  });
  await send("Page.navigate", { url: URL });
  await sleep(2500);
  await ev('document.getElementById("giscus").scrollIntoView({block:"center"})');
  await sleep(5000);

  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const frame = list.find((x) => (x.url || "").includes("giscus.app") && x.type === "iframe");
  if (!frame) {
    console.log("цель окна Giscus не найдена; цели:", list.map((x) => x.type).join(","));
    process.exit(1);
  }

  // Главное — что окно не показывает ошибку настройки (не установлено
  // приложение, нет доступа к обсуждениям, неверная категория).
  const text = await rpc(frame.webSocketDebuggerUrl, "Runtime.evaluate", {
    expression: 'document.body.innerText.replace(/\\s+/g," ").trim().slice(0,400)',
    returnByValue: true,
  }).then((r) => r.result.value);
  console.log("текст окна:", text || "(пусто)");
  const bad = /not installed|not found|error|ошибк|не найден|не установлен|недоступ/i.test(text || "");
  console.log(bad ? "ВНИМАНИЕ: окно сообщает об ошибке" : "окно без ошибок настройки");
  // Тему внутри окна несёт не <html>, а вложенный элемент с data-theme.
  const read = async () => {
    const r = await rpc(frame.webSocketDebuggerUrl, "Runtime.evaluate", {
      expression: `JSON.stringify({
        theme: (document.querySelector("[data-theme]")||{}).getAttribute
          ? document.querySelector("[data-theme]").getAttribute("data-theme") : null
      })`,
      returnByValue: true,
    });
    return JSON.parse(r.result.value);
  };

  const before = await read();
  console.log("окно до переключения:", JSON.stringify(before));

  await ev(`document.querySelector('.theme-toggle, [data-theme-toggle], #theme-toggle')?.click()`);
  await sleep(3500);
  const site = await ev('document.documentElement.dataset.theme || "light"');
  const after = await read();
  console.log("тема сайта:", site);
  console.log("окно после переключения:", JSON.stringify(after));

  const changed = before.bg !== after.bg || before.attr !== after.attr;
  console.log(changed ? "ИТОГ: тема окна следует за сайтом"
                      : "ИТОГ: тема окна НЕ меняется");
  await send("Target.closeTarget", { targetId: t.id }).catch(() => {});
  ws.close();
  process.exit(changed ? 0 : 1);
})().catch((e) => { console.error("ОШИБКА:", e.message); process.exit(1); });
