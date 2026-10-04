// Скриншоты мастерской «Логоса» для визуальной проверки.
const PORT = 9222;
const fs = require("fs");
let ws, id = 0;
const pending = new Map();

function send(method, params = {}) {
  return new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
}

async function main() {
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

  const load = (u) => {
    const p = new Promise((r) => {
      const h = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.method === "Page.loadEventFired") {
          ws.removeEventListener("message", h);
          r();
        }
      };
      ws.addEventListener("message", h);
    });
    return send("Page.navigate", { url: u }).then(() => p);
  };
  const ev = (e) => send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true });
  const shot = async (name) => {
    const s = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    fs.writeFileSync("/workspace/project/" + name, Buffer.from(s.data, "base64"));
  };

  await send("Emulation.setDeviceMetricsOverride",
    { width: 1280, height: 1400, deviceScaleFactor: 1, mobile: false });
  await load("http://127.0.0.1:8899/logos/workshop/");
  await ev("localStorage.removeItem('logos-workshop'); true");
  await load("http://127.0.0.1:8899/logos/workshop/");
  await ev(`document.getElementById('ws-setup-form').nick.value='Ночной читатель';
    document.getElementById('ws-setup-form').about.value='Пишу о книгах и тишине';
    document.getElementById('ws-setup-form').dispatchEvent(new Event('submit',{cancelable:true})); true`);
  await ev(`document.getElementById('ws-new').click();
    var f=document.getElementById('ws-form');
    f.title.value='О чём молчит тишина';
    f.tags.value='философия, наблюдения';
    f.summary.value='Иногда самое важное — то, что автор не сказал.';
    f.body.value='Тишина в тексте работает как **пауза** в разговоре: она даёт читателю место для своей мысли.\\n\\n- не договаривать лишнего\\n- доверять читателю\\n- оставлять воздух между абзацами';
    f.dispatchEvent(new Event('submit',{cancelable:true})); true`);
  await new Promise((r) => setTimeout(r, 600));
  await shot("ws-1-profile.png");

  await ev(`document.getElementById('ws-new').click();
    var f=document.getElementById('ws-form');
    f.title.value='Три правила ясного текста';
    f.tags.value='текст, мастерство';
    f.summary.value='Одна мысль — один абзац.';
    f.body.value='1. Одна мысль — один абзац.\\n2. Меньше прилагательных.\\n3. Пишите вслух.';
    f.dispatchEvent(new Event('submit',{cancelable:true}));
    document.getElementById('ws-new').click();
    var g=document.getElementById('ws-form');
    g.title.value='Черновик';
    g.body.value='Ещё одна мысль в работе.';
    true`);
  await new Promise((r) => setTimeout(r, 600));
  await shot("ws-2-editor.png");

  await ev("document.getElementById('ws-cancel').click(); true");
  await send("Emulation.setDeviceMetricsOverride",
    { width: 390, height: 1200, deviceScaleFactor: 2, mobile: true });
  await new Promise((r) => setTimeout(r, 500));
  await shot("ws-3-mobile.png");

  await send("Page.close");
  ws.close();
  console.log("скриншоты готовы");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
