// Проверка в настоящем браузере: внедрённый скрипт не должен выполниться.
const PORT = 9222;
const BASE = process.argv[2];

async function session(fn) {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' });
  const target = await res.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const events = [];
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    } else if (m.method === 'Page.loadEventFired') events.push(m.method);
    else if (m.method === 'Log.entryAdded') events.push({ log: m.params.entry });
    else if (m.method === 'Page.javascriptDialogOpening') events.push({ dialog: m.params });
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');
  const out = await fn(send, events, target);
  await send('Target.closeTarget', { targetId: target.id }).catch(() => {});
  ws.close();
  return out;
}

const PAYLOAD = `<script>window.__pwned = "скрипт выполнился";</script>
<img src=x onerror="window.__pwned = 'обработчик выполнился'">
<a href="javascript:window.__pwned='ссылка выполнилась'">жми</a>`;

(async () => {
  // 1. Публикуем пост с вредоносной разметкой прямо через форму сайта.
  const form = new URLSearchParams({
    title: 'Проверка защиты', author: 'Тест',
    body: 'Текст до.\n\n' + PAYLOAD + '\n\nТекст после.',
    tags: 'тест', summary: 'Проверка',
  });
  const r = await fetch(BASE + '/new', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form, redirect: 'follow',
  });
  const html = await r.text();
  const id = (html.match(/\/post\/(\d+)/) || [])[1];

  const res = await session(async (send, events, target) => {
    await send('Page.navigate', { url: BASE + '/post/' + id });
    await new Promise(r => setTimeout(r, 2500));
    const m = await send('Runtime.evaluate', {
      expression: `({
        pwned: window.__pwned || null,
        prose: document.querySelector('.prose') ? document.querySelector('.prose').innerHTML : null,
        has_script_tag: !!document.querySelector('.prose script'),
        has_onerror: !!(document.querySelector('.prose img[onerror]')),
        js_href: [...document.querySelectorAll('.prose a')].map(a => a.getAttribute('href')),
      })`,
      returnByValue: true,
    });
    return { data: m.result.value, events };
  });

  console.log('=== Страница поста с вредоносной разметкой ===');
  console.log('   признак выполнения (window.__pwned):', res.data.pwned === null ? 'НЕТ — защита сработала' : res.data.pwned);
  console.log('   <script> в тексте:', res.data.has_script_tag);
  console.log('   обработчик onerror в теге:', res.data.has_onerror);
  console.log('   href у ссылок:', JSON.stringify(res.data.js_href));
  console.log('\n   что осталось в тексте:');
  console.log('   ' + String(res.data.prose).replace(/\n/g, ' ').slice(0, 200));

  const dialogs = res.events.filter(e => e.dialog);
  console.log(`\n   всплывающих окон alert: ${dialogs.length}`);
  const errs = res.events.filter(e => e.log && e.log.level === 'error');
  console.log(`   ошибок консоли: ${errs.length}`);
  for (const e of errs.slice(0, 5)) console.log('     ' + (e.log.text || '').slice(0, 140));
})().catch(e => { console.error('ОШИБКА:', String(e).slice(0, 300)); process.exit(1); });
