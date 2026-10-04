// Проверка вёрстки мастерской: нет ли горизонтального переполнения
// и не наезжают ли элементы друг на друга на узком экране.
const PORT = 9222;
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
  const ev = (e) => send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })
    .then((r) => r.result.value);

  const probe = async (label) => {
    const data = await ev(`(() => {
      const doc = document.documentElement;
      const overflow = doc.scrollWidth - doc.clientWidth;
      const wide = Array.from(document.querySelectorAll('.workshop *')).filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > doc.clientWidth + 1 || r.left < -1);
      }).map((el) => el.className || el.tagName).slice(0, 5);
      const setup = document.getElementById('ws-setup');
      const profile = document.getElementById('ws-profile');
      return JSON.stringify({
        overflow: overflow,
        wide: wide,
        setupHidden: setup ? setup.hidden : null,
        profileHidden: profile ? profile.hidden : null,
        listCount: document.querySelectorAll('#ws-list .post-card').length,
      });
    })()`);
    console.log("  " + label + ": " + data);
    return JSON.parse(data);
  };

  const problems = [];
  const check = (name, ok) => {
    console.log("  " + (ok ? "OK  " : "СБОЙ") + " " + name);
    if (!ok) problems.push(name);
  };

  for (const [label, width, height, mobile] of [
    ["широкий 1280", 1280, 1400, false],
    ["планшет 820", 820, 1200, false],
    ["телефон 390", 390, 1000, true],
    ["узкий 320", 320, 900, true],
  ]) {
    await send("Emulation.setDeviceMetricsOverride",
      { width, height, deviceScaleFactor: 1, mobile });
    await load("http://127.0.0.1:8899/logos/workshop/");
    await ev("localStorage.removeItem('logos-workshop'); true");
    await load("http://127.0.0.1:8899/logos/workshop/");
    await ev(`document.getElementById('ws-setup-form').nick.value='Проверка';
      document.getElementById('ws-setup-form').dispatchEvent(new Event('submit',{cancelable:true}));
      document.getElementById('ws-new').click();
      var f=document.getElementById('ws-form');
      f.title.value='Длинный заголовок мысли для проверки переноса строк на узком экране';
      f.tags.value='проверка, вёрстка, длинныетеги';
      f.summary.value='Описание тоже достаточно длинное, чтобы проверить, как оно переносится.';
      f.body.value='Текст мысли с **разметкой** и длинным словом: проверкапроверкапроверкапроверкапроверка.';
      f.dispatchEvent(new Event('submit',{cancelable:true})); true`);
    const r = await probe(label);
    check(label + ": нет переполнения по ширине", r.overflow <= 1);
    check(label + ": элементы в пределах экрана", r.wide.length === 0);
    check(label + ": мастерская показана", r.profileHidden === false);
    check(label + ": мысль на месте", r.listCount === 1);
  }

  await send("Page.close");
  ws.close();
  console.log("\n  " + (problems.length ? "ПРОБЛЕМЫ: " + problems.join("; ") : "вёрстка в порядке"));
  return problems.length ? 1 : 0;
}

main().then((c) => process.exit(c)).catch((e) => {
  console.error("Ошибка:", e.message);
  process.exit(1);
});
