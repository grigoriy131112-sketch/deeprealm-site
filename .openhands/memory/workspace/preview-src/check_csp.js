// Проверка CSP и скриптов в реальном браузере: тема должна работать.
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
    else if (m.method === 'Runtime.consoleAPICalled') events.push({ console: m.params });
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');
  const out = await fn(send, events, target);
  await send('Target.closeTarget', { targetId: target.id }).catch(() => {});
  ws.close();
  return out;
}

(async () => {
  const res = await session(async (send, events, target) => {
    await send('Page.navigate', { url: BASE + '/' });
    await new Promise(r => setTimeout(r, 2500));
    const r = await send('Runtime.evaluate', {
      expression: `(async () => {
        const out = {};
        out.theme = document.documentElement.getAttribute('data-theme');
        out.toggle_icon = document.querySelector('.theme-icon') ? document.querySelector('.theme-icon').textContent : null;
        // переключаем тему — если скрипт заблокирован, ничего не изменится
        document.getElementById('theme-toggle').click();
        await new Promise(r => setTimeout(r, 300));
        out.theme_after_click = document.documentElement.getAttribute('data-theme');
        out.stored = localStorage.getItem('logos-theme');
        out.toggle_icon_after = document.querySelector('.theme-icon').textContent;
        out.progress_width = document.getElementById('reading-progress').style.width;
        return out;
      })()`,
      awaitPromise: true, returnByValue: true,
    });
    return { data: r.result.value, events };
  });

  console.log('=== Проверка в браузере ===');
  for (const [k, v] of Object.entries(res.data)) console.log(`   ${k.padEnd(20)} = ${v}`);

  const problems = res.events.filter(e => e.log && (e.log.level === 'error' || e.log.level === 'warning'));
  console.log('\n=== Ошибки и предупреждения консоли ===');
  if (!problems.length) console.log('   нет');
  for (const p of problems.slice(0, 12)) {
    console.log(`   [${p.log.level}] ${(p.log.text || '').slice(0, 160)}`);
  }
  const csp = problems.filter(p => /Content Security Policy|CSP/i.test(p.log.text || ''));
  console.log(`\n   нарушений CSP: ${csp.length}`);
})().catch(e => { console.error('ОШИБКА:', String(e).slice(0, 300)); process.exit(1); });
