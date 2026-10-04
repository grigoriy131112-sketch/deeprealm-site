// Проверка статической сборки «Логоса» в настоящем браузере:
// тема, поиск, случайная мысль, навигация, ошибки консоли.
const PORT = 9222;
const BASE = process.argv[2] || "http://127.0.0.1:8899/logos/";

let ws, msgId = 0;
const pending = new Map();
const consoleErrors = [];

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function connect() {
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
    if (m.method === "Runtime.exceptionThrown") {
      const d = m.params.exceptionDetails;
      consoleErrors.push(d.exception?.description || d.text || "исключение");
    }
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error") {
      consoleErrors.push(m.params.entry.text);
    }
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
      consoleErrors.push(m.params.args.map((a) => a.value || a.description).join(" "));
    }
  });
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Log.enable");
  return target;
}

async function visit(url) {
  consoleErrors.length = 0;
  const loaded = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("load timeout: " + url)), 40000);
    const handler = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.method === "Page.loadEventFired") {
        clearTimeout(t);
        ws.removeEventListener("message", handler);
        resolve();
      }
    };
    ws.addEventListener("message", handler);
  });
  await send("Page.navigate", { url });
  await loaded;
  await new Promise((r) => setTimeout(r, 400));
}

const evaluate = async (expr) => {
  const r = await send("Runtime.evaluate", {
    expression: expr, awaitPromise: true, returnByValue: true, timeout: 60000,
  });
  if (r.exceptionDetails) {
    throw new Error("ошибка в странице: " + JSON.stringify(r.exceptionDetails).slice(0, 300));
  }
  return r.result.value;
};

(async () => {
  const results = [];
  const problems = [];
  const target = await connect();
  const check = (name, ok) => results.push([name, !!ok]);

  // --- Главная ---
  await visit(BASE);
  check("главная: заголовок", (await evaluate("document.title")).includes("Логос"));
  check("главная: карточек публикаций — 5",
    (await evaluate("document.querySelectorAll('.post-card').length")) === 5);
  check("главная: стили применились",
    (await evaluate("getComputedStyle(document.body).backgroundColor")) !== "rgba(0, 0, 0, 0)");
  check("главная: боковая колонка с темами",
    (await evaluate("document.querySelectorAll('.tag-cloud .tag').length")) === 7);
  if (consoleErrors.length) problems.push("главная: " + consoleErrors.join(" | "));

  // Тема
  const before = await evaluate("document.documentElement.getAttribute('data-theme')");
  await evaluate("document.getElementById('theme-toggle').click()");
  await new Promise((r) => setTimeout(r, 300));
  const after = await evaluate("document.documentElement.getAttribute('data-theme')");
  check("тема переключается", before !== after);
  check("тема запомнилась",
    (await evaluate("localStorage.getItem('logos-theme')")) === after);

  // Поиск
  await evaluate(`(() => {
    const i = document.querySelector('.search input[type="search"]');
    i.value = 'тишина';
    i.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await new Promise((r) => setTimeout(r, 300));
  check("поиск сужает список до 1",
    (await evaluate(`Array.from(document.querySelectorAll('.post-card'))
      .filter(c => c.style.display !== 'none').length`)) === 1);
  check("поиск меняет заголовок",
    (await evaluate("document.querySelector('.feed h2').textContent.trim()")).startsWith("Поиск"));

  await evaluate(`(() => {
    const i = document.querySelector('.search input[type="search"]');
    i.value = 'нетакогослова';
    i.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await new Promise((r) => setTimeout(r, 300));
  check("поиск показывает «не найдено»",
    await evaluate("!!document.querySelector('.static-search-note')"));

  // Случайная мысль
  check("случайная мысль: список из 5 публикаций",
    (await evaluate("document.getElementById('random-link').dataset.posts"))
      .split(",").filter(Boolean).length === 5);
  await evaluate("document.getElementById('random-link').click()");
  await new Promise((r) => setTimeout(r, 800));
  check("случайная мысль открывает публикацию",
    (await evaluate("location.pathname")).includes("/post/"));

  // --- Публикация ---
  await visit(BASE + "post/5/");
  check("публикация: текст отрисован",
    (await evaluate("(document.querySelector('.prose')||{}).textContent||''")).trim().length > 100);
  check("публикация: 4 реакции видны",
    (await evaluate("document.querySelectorAll('.reaction').length")) === 4);
  check("публикация: серверных форм нет",
    (await evaluate("document.querySelectorAll('.reactions form, .comment-form').length")) === 0);
  check("публикация: окно откликов Giscus на месте",
    await evaluate("!!document.querySelector('.giscus')"));
  check("публикация: пояснение-заглушка убрано",
    await evaluate("!document.querySelector('.static-note')"));
  check("публикация: заголовок в meta для соцсетей",
    (await evaluate("document.querySelector('meta[property=\"og:title\"]').content")).length > 3);
  if (consoleErrors.length) problems.push("публикация: " + consoleErrors.join(" | "));

  // --- Навигация ---
  await visit(BASE);
  await evaluate(`Array.from(document.querySelectorAll('.nav a'))
    .find(a => a.textContent.includes('Авторы')).click()`);
  await new Promise((r) => setTimeout(r, 800));
  check("навигация: «Авторы» открылась",
    (await evaluate("location.pathname")).includes("/authors/"));
  check("авторы: карточек 3",
    (await evaluate("document.querySelectorAll('.author-card').length")) === 3);

  // --- Тег ---
  await visit(BASE + "tag/tekst/");
  check("тег: заголовок содержит тему",
    (await evaluate("document.querySelector('.feed h2').textContent")).includes("текст"));
  check("тег: canonical без ?tag=",
    !(await evaluate("document.querySelector('link[rel=\"canonical\"]').href")).includes("?tag="));
  if (consoleErrors.length) problems.push("тег: " + consoleErrors.join(" | "));

  // --- Страница «О блоге» ---
  await visit(BASE + "about/");
  check("о блоге: текст на месте",
    (await evaluate("document.querySelector('.prose').textContent")).includes("Логос"));

  // --- Карта сайта и лента ---
  // Адреса должны быть каноническими (со слешем): без него Pages отдаёт
  // редирект 301, и поисковики видят два адреса одной страницы.
  // Сырой XML берём запросом: в браузере лента показывается через XSLT.
  const smap = await (await fetch(BASE + "sitemap.xml")).text();
  check("карта сайта: мастерская включена", smap.includes("/logos/workshop/"));
  check("карта сайта: теги включены", smap.includes("/logos/tag/"));
  check("карта сайта: авторы включены", smap.includes("/logos/author/"));
  check("карта сайта: служебная страница записи не попала",
    !smap.includes("/logos/new"));
  check("карта сайта: адреса со слешем",
    !/logos\/(post\/\d+|about|authors|workshop|tag\/[a-z-]+|author\/[a-z-]+)</.test(smap));

  const feed = await (await fetch(BASE + "feed.xml")).text();
  check("лента: ссылки на посты со слешем",
    !/logos\/post\/\d+</.test(feed) && /logos\/post\/\d+\//.test(feed));

  // --- 404 ---
  // Локальный http.server отдаёт на несуществующий адрес свою заглушку,
  // а не 404.html, поэтому содержимое проверяем на самой странице,
  // а код ответа — отдельным запросом.
  await visit(BASE + "404.html");
  const body404 = await evaluate("document.body.textContent");
  check("страница 404: понятный текст",
    body404.includes("потерялась") || body404.includes("не существует"));
  const missing = await evaluate(
    `fetch("${BASE}net-takoj-stranicy/").then(r => r.status)`);
  check("несуществующий адрес отвечает 404", missing === 404);

  await send("Target.closeTarget", { targetId: target.id }).catch(() => {});
  ws.close();

  console.log("=== Проверка статической сборки ===");
  let failed = 0;
  for (const [name, ok] of results) {
    console.log(`  ${ok ? "OK  " : "СБОЙ"} ${name}`);
    if (!ok) failed += 1;
  }
  console.log(`\n  итого: ${results.length - failed}/${results.length} пройдено`);
  if (problems.length) {
    console.log("\n=== Ошибки консоли ===");
    problems.forEach((p) => console.log("  " + p));
  } else {
    console.log("  ошибок консоли нет");
  }
  process.exit(failed ? 1 : 0);
})();
