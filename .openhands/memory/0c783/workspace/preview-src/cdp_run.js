// Запускает страницу в chromium и ждёт реального завершения промиса из неё (CDP).
// Нужен, потому что --virtual-time-budget прокручивает таймеры, но не ждёт PBKDF2.
const PORT = 9222;

async function main() {
  const url = process.argv[2];
  const expr = process.argv[3];

  const res = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' });
  const target = await res.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);

  let id = 0;
  const pending = new Map();
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
    }
  });

  await send('Runtime.enable');
  await send('Page.enable');

  // Навигация после подписки на события, иначе loadEventFired можно пропустить.
  const loaded = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('load timeout')), 40000);
    ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data);
      if (m.method === 'Page.loadEventFired') { clearTimeout(t); resolve(); }
    });
  });
  await send('Page.navigate', { url });
  await loaded;

  const r = await send('Runtime.evaluate', {
    expression: expr,
    awaitPromise: true,
    returnByValue: true,
    timeout: 120000,
  });

  if (r.exceptionDetails) {
    console.error('ОШИБКА:', JSON.stringify(r.exceptionDetails).slice(0, 600));
  } else {
    process.stdout.write(JSON.stringify(r.result.value));
  }
  await send('Target.closeTarget', { targetId: target.id }).catch(() => {});
  ws.close();
}

main().catch(e => { console.error(String(e)); process.exit(1); });
