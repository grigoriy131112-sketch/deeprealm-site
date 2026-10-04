// Проверка кнопки «Написать»: с любой страницы она ведёт в мастерскую
// и сразу открывает форму записи (а без профиля — просит псевдоним).
const PORT = 9222;
const BASE = process.argv[2] || "http://127.0.0.1:8899/logos/";

let ws, id = 0;
const pending = new Map();

function send(method, params = {}) {
  return new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
}

async function connect() {
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
}

async function load(url) {
  const p = new Promise((resolve) => {
    const h = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.method === "Page.loadEventFired") {
        ws.removeEventListener("message", h);
        resolve();
      }
    };
    ws.addEventListener("message", h);
    setTimeout(resolve, 15000);
  });
  await send("Page.navigate", { url });
  await p;
  await new Promise((r) => setTimeout(r, 400));
}

async function ev(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || "ошибка");
  return r.result.value;
}

const checks = [];
const check = (name, ok) => checks.push([name, Boolean(ok)]);

async function clickHeaderWrite() {
  // Кнопка «Написать» в шапке — единственная .btn-primary в .nav.
  await ev(`document.querySelector('.nav .btn-primary').click(); true`);
  await new Promise((r) => setTimeout(r, 800));
}

async function main() {
  await connect();

  // Без профиля: кнопка приводит в мастерскую и просит псевдоним.
  await load(BASE);
  await ev("localStorage.removeItem('logos-workshop'); true");
  await load(BASE);
  const hasButton = await ev("!!document.querySelector('.nav .btn-primary')");
  check("кнопка «Написать» есть в шапке", hasButton);
  check("кнопка ведёт в мастерскую",
    (await ev("document.querySelector('.nav .btn-primary').getAttribute('href')")).indexOf("/workshop/#new") !== -1);

  await clickHeaderWrite();
  check("перешли в мастерскую", await ev("location.pathname.endsWith('/workshop/')"));
  check("без профиля просят псевдоним", await ev(
    "document.getElementById('ws-setup').hidden === false"));
  check("форма записи ещё скрыта", await ev(
    "document.getElementById('ws-editor').hidden === true"));

  // Заполняем псевдоним — форма должна открыться сама.
  await ev(`document.getElementById('ws-setup-form').nick.value='Тест Перехода';
    document.getElementById('ws-setup-form').dispatchEvent(new Event('submit',{cancelable:true})); true`);
  check("после псевдонима форма открылась", await ev(
    "document.getElementById('ws-editor').hidden === false"));
  check("заголовок формы — новая мысль", (await ev(
    "document.getElementById('ws-editor-title').textContent")) === "Новая мысль");

  // Пишем мысль.
  await ev(`var f=document.getElementById('ws-form');
    f.title.value='Мысль через кнопку';
    f.body.value='Текст мысли, написанной после перехода по кнопке.';
    f.dispatchEvent(new Event('submit',{cancelable:true})); true`);
  check("мысль сохранена", (await ev("document.querySelectorAll('#ws-list .post-card').length")) === 1);
  check("якорь убран после сохранения", (await ev("location.hash")) === "");

  // Теперь с профилем: кнопка должна открывать форму сразу.
  await load(BASE);
  await clickHeaderWrite();
  check("с профилем форма открыта сразу", await ev(
    "document.getElementById('ws-editor').hidden === false"));
  check("якорь #new в адресе", (await ev("location.hash")) === "#new");

  // Другая кнопка на главной — «Поделиться мыслью».
  await load(BASE);
  const heroHref = await ev("document.querySelector('.hero-actions .btn-primary').getAttribute('href')");
  check("«Поделиться мыслью» ведёт в мастерскую", heroHref.indexOf("/workshop/#new") !== -1);

  // Со страницы «О блоге».
  await load(BASE + "about/");
  const aboutHref = await ev("document.querySelector('.hero-actions .btn-primary').getAttribute('href')");
  check("на «О блоге» кнопка ведёт в мастерскую", aboutHref.indexOf("/workshop/#new") !== -1);
  await ev("document.querySelector('.hero-actions .btn-primary').click(); true");
  await new Promise((r) => setTimeout(r, 800));
  check("перешли и форма открыта", await ev(
    "location.pathname.endsWith('/workshop/') && document.getElementById('ws-editor').hidden === false"));

  // Прямой заход на /new/ (старый адрес) тоже приводит в мастерскую.
  await load(BASE + "new/");
  await new Promise((r) => setTimeout(r, 900));
  check("старый /new/ перенаправляет в мастерскую", await ev(
    "location.pathname.endsWith('/workshop/')"));
  check("на /new/ форма записи открыта", await ev(
    "!!document.getElementById('ws-editor') && document.getElementById('ws-editor').hidden === false"));
  check("на /new/ нет тупиковой заглушки", await ev(
    "document.body.textContent.indexOf('Публикации добавляет автор блога') === -1"));

  await send("Page.close");
  ws.close();

  let ok = true;
  for (const [name, passed] of checks) {
    console.log("  " + (passed ? "OK  " : "СБОЙ") + " " + name);
    ok = ok && passed;
  }
  console.log("\n  итого: " + checks.filter(([, p]) => p).length + "/" + checks.length);
  return ok ? 0 : 1;
}

main().then((c) => process.exit(c)).catch((e) => {
  console.error("Ошибка:", e.message);
  process.exit(1);
});
