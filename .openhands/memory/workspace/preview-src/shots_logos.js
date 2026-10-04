// Снимки и замеры страниц «Логоса» через CDP.
const PORT = 9222;
const BASE = process.argv[2] || 'http://127.0.0.1:12005';
const OUT = process.argv[3] || '/workspace/project/.logos-shots';

const PAGES = [
  ['index', '/', 1280, 900],
  ['post', '/post/1', 1280, 900],
  ['authors', '/authors', 1280, 700],
  ['about', '/about', 1280, 700],
  ['feed', '/feed.xml', 1280, 900],
  ['mobile-index', '/', 390, 844],
  ['mobile-post', '/post/1', 390, 844],
];

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
  });
  await send('Runtime.enable');
  await send('Page.enable');
  const out = await fn(send, events, target);
  await send('Target.closeTarget', { targetId: target.id }).catch(() => {});
  ws.close();
  return out;
}

async function navigate(send, events, url) {
  const before = events.length;
  await send('Page.navigate', { url });
  for (let i = 0; i < 300; i++) {
    if (events.length > before) return;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('нет загрузки: ' + url);
}

const MEASURE = `(() => {
  const r = {};
  r.title = document.title;
  r.errors = window.__errors || [];
  r.horizontal_overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
  r.scrollWidth = document.documentElement.scrollWidth;
  r.innerWidth = window.innerWidth;
  const nav = document.querySelector('.nav');
  r.nav_links_visible = nav ? [...nav.querySelectorAll('a')].filter(a => {
    const s = getComputedStyle(a);
    return s.display !== 'none' && s.visibility !== 'hidden' && a.getBoundingClientRect().width > 0;
  }).map(a => a.textContent.trim()) : null;
  const h1 = document.querySelector('h1');
  r.h1 = h1 ? h1.textContent.trim() : null;
  r.has_prose = !!document.querySelector('.prose');
  r.prose_html = document.querySelector('.prose') ? document.querySelector('.prose').innerHTML.slice(0, 120) : null;
  return r;
})()`;

(async () => {
  const fs = require('fs');
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, path, w, h] of PAGES) {
    const data = await session(async (send, events, target) => {
      await send('Emulation.setDeviceMetricsOverride',
        { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
      await navigate(send, events, BASE + path);
      await new Promise(r => setTimeout(r, 800));
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(shot.data, 'base64'));
      const m = await send('Runtime.evaluate', { expression: MEASURE, returnByValue: true });
      return m.result.value;
    });
    console.log(`--- ${name} (${w}px) ---`);
    console.log(`    заголовок: ${data.title}`);
    console.log(`    h1: ${data.h1}`);
    console.log(`    переполнение по ширине: ${data.horizontal_overflow} (scroll ${data.scrollWidth} / окно ${data.innerWidth})`);
    console.log(`    видимые ссылки меню: ${JSON.stringify(data.nav_links_visible)}`);
    if (data.prose_html) console.log(`    начало текста: ${data.prose_html.replace(/\n/g, ' ').slice(0, 90)}`);
  }
})().catch(e => { console.error('ОШИБКА:', String(e).slice(0, 300)); process.exit(1); });
