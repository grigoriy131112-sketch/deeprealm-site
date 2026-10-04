// Полная проверка дневника на чистом origin (свой порт => свой localStorage).
const PORT = 9222;
const BASE = process.argv[2];
const PW = "test1234";

const STEP1 = `(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  await wait(600);
  const disp = id => getComputedStyle(document.getElementById(id)).display;
  const open = () => document.getElementById('lockOverlay').classList.contains('open');
  const r = {};
  r['A1_баннер_скрыт'] = disp('lockBanner');
  r['A2_окно_пароля_закрыто'] = !open();
  r['A3_редактор_доступен'] = document.getElementById('dbody').contentEditable;

  document.getElementById('lockBtn').click(); await wait(100);
  r['A4_окно_установки_открыто'] = open();
  r['A4_заголовок'] = document.getElementById('lockTitle').textContent.trim();
  r['A4_поле_повтора_видно'] = disp('passRow2') !== 'none';
  r['A4_крестик_виден'] = disp('lockClose') !== 'none';
  r['A4_отмена_видна'] = disp('lockCancel') !== 'none';

  document.getElementById('lockCancel').click(); await wait(100);
  r['A5_отмена_закрыла'] = !open();
  r['A5_дневник_без_пароля'] = document.getElementById('lockBtn').textContent.trim() === '\\u{1F513}';

  document.getElementById('lockBtn').click(); await wait(100);
  document.getElementById('passInput').value = '${PW}';
  document.getElementById('passInput2').value = '${PW}';
  document.getElementById('lockOk').click();
  for (let i = 0; i < 90 && open(); i++) await wait(1000);
  r['A6_окно_закрыто'] = !open();
  r['A6_значок_замка'] = document.getElementById('lockBtn').textContent.trim();
  r['A6_есть_шифр'] = !!localStorage.getItem('volna.diary.enc');
  r['A6_открытого_текста_нет'] = !localStorage.getItem('volna.diary.v1');
  return r;
})()`;

const STEP2 = `(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  await wait(800);
  const disp = id => getComputedStyle(document.getElementById(id)).display;
  const open = () => document.getElementById('lockOverlay').classList.contains('open');
  const r = {};
  r['B1_окно_пароля_открыто'] = open();
  r['B1_крестик_виден'] = disp('lockClose') !== 'none';
  r['B1_отмена_видна'] = disp('lockCancel') !== 'none';
  r['B1_редактор_заблокирован'] = document.getElementById('dbody').contentEditable === 'false';
  r['B1_список_пуст'] = document.getElementById('list').textContent.includes('Записей пока нет');

  document.getElementById('lockClose').click(); await wait(80);
  r['B2_крестик_не_закрыл'] = open();
  document.getElementById('lockCancel').click(); await wait(80);
  r['B3_отмена_не_закрыла'] = open();
  document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}));
  await wait(80);
  r['B4_Escape_не_закрыл'] = open();

  document.getElementById('passInput').value = 'неверный';
  document.getElementById('lockOk').click(); await wait(2000);
  r['B5_сообщение'] = document.getElementById('lockMsg').textContent.trim().slice(0,45);
  r['B5_окно_открыто'] = open();

  document.getElementById('passInput').value = '${PW}';
  document.getElementById('lockOk').click();
  for (let i = 0; i < 90 && open(); i++) await wait(1000);
  r['B6_окно_закрыто'] = !open();
  r['B6_редактор_доступен'] = document.getElementById('dbody').contentEditable;
  r['B6_баннер_скрыт'] = disp('lockBanner');
  return r;
})()`;

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
  const out = await fn(send, ws, events);
  await send('Target.closeTarget', { targetId: target.id }).catch(() => {});
  ws.close();
  return out;
}

async function navigate(send, ws, events, url) {
  const before = events.length;
  await send('Page.navigate', { url });
  for (let i = 0; i < 400; i++) {
    if (events.length > before) return;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('load timeout: ' + url);
}

async function evaluate(send, expr) {
  const r = await send('Runtime.evaluate',
    { expression: expr, awaitPromise: true, returnByValue: true, timeout: 180000 });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500));
  return r.result.value;
}

(async () => {
  const url = BASE + '/diary.html';

  console.log('=== А. ЧИСТЫЙ БРАУЗЕР: дневник без пароля, ставим пароль ===');
  const a = await session(async (send, ws, events) => {
    await navigate(send, ws, events, url);
    return evaluate(send, STEP1);
  });
  for (const [k, v] of Object.entries(a)) console.log(`    ${k.padEnd(30)} = ${v}`);

  console.log('\n=== Б. ПЕРЕЗАГРУЗКА: дневник зашифрован, просит пароль ===');
  const b = await session(async (send, ws, events) => {
    await navigate(send, ws, events, url);
    return evaluate(send, STEP2);
  });
  for (const [k, v] of Object.entries(b)) console.log(`    ${k.padEnd(30)} = ${v}`);
})().catch(e => { console.error('ОШИБКА:', String(e).slice(0, 400)); process.exit(1); });
