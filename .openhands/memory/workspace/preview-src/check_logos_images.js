// Проверяет, что картинки статьи про «Логос» реально загружаются:
// не только отдаются по ссылке, но и отрисованы на странице.
const PORT = 9222;
const ARTICLE = "https://telegra.ph/Logos--blog-dlya-myslej-i-publikacij-kratko-10-03";
const IMG = "https://grigoriy131112-sketch.github.io/logos/static/img/logos-";

let ws, msgId = 0;
const pending = new Map();

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function main() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" });
  const target = await res.json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    }
  });
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });

  const loaded = new Promise((resolve) => {
    ws.addEventListener("message", (ev) => {
      if (JSON.parse(ev.data).method === "Page.loadEventFired") resolve();
    });
  });
  await send("Page.navigate", { url: ARTICLE });
  await loaded;
  await new Promise((r) => setTimeout(r, 4000));

  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result.value;
  };

  const results = [];
  const check = (name, ok) => results.push([name, !!ok]);

  const count = await evaluate(`document.querySelectorAll("figure img").length`);
  check(`на странице ${count} картинок (нужно 5)`, count === 5);

  const broken = await evaluate(
    `[...document.querySelectorAll("figure img")].filter(i => !i.complete || i.naturalWidth === 0).length`);
  check("все картинки догрузились без ошибок", broken === 0);

  const widths = await evaluate(
    `[...document.querySelectorAll("figure img")].map(i => i.naturalWidth + "x" + i.naturalHeight).join(",")`);
  check(`размеры картинок 1200x675: ${widths}`, widths.split(",").every((w) => w === "1200x675"));

  const srcs = await evaluate(
    `[...document.querySelectorAll("figure img")].map(i => i.src).join("\\n")`);
  check("ссылки ведут на наш сайт, а не на чужой хостинг",
    srcs.split("\n").every((s) => s.startsWith(IMG)));

  const caps = await evaluate(
    `[...document.querySelectorAll("figcaption")].map(f => f.textContent.trim()).join(" | ")`);
  check(`подписи на месте: ${caps.slice(0, 60)}...`,
    (caps.match(/\|/g) || []).length >= 4 && caps.includes("Логос"));

  const body = await evaluate(`document.body.textContent`);
  check("текст статьи остался на месте", body.includes("блог для мыслей") && body.includes("GitHub Pages"));

  const link = await evaluate(
    `[...document.querySelectorAll("a")].some(a => a.href === "https://grigoriy131112-sketch.github.io/logos/")`);
  check("ссылка на сайт в статье есть", link);

  await send("Target.closeTarget", { targetId: target.id }).catch(() => {});
  ws.close();

  console.log("=== Картинки статьи про «Логос» ===");
  let failed = 0;
  for (const [name, ok] of results) {
    console.log(`  ${ok ? "OK  " : "СБОЙ"} ${name}`);
    if (!ok) failed += 1;
  }
  console.log(`\n  итого: ${results.length - failed}/${results.length} пройдено`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error("ОШИБКА:", e.message); process.exit(1); });
