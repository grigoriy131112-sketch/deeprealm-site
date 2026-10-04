const PW = "test1234";
const expr = `(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  await wait(500);
  const disp = id => getComputedStyle(document.getElementById(id)).display;
  const open = () => document.getElementById('lockOverlay').classList.contains('open');
  const r = {};

  r['hidden_баннер'] = disp('lockBanner');
  r['hidden_пометка_настроения'] = disp('moodLink');
  r['1_окно_открыто'] = open();
  r['1_крестик_виден'] = disp('lockClose') !== 'none';
  r['1_отмена_видна'] = disp('lockCancel') !== 'none';

  document.getElementById('lockClose').click(); await wait(60);
  r['2_крестик_закрыл'] = open();
  document.getElementById('lockCancel').click(); await wait(60);
  r['3_отмена_закрыла'] = open();
  document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}));
  await wait(60);
  r['4_Escape_закрыл'] = open();

  document.getElementById('passInput').value = 'неверный';
  document.getElementById('lockOk').click();
  await wait(1500);
  r['5_сообщение_неверный'] = document.getElementById('lockMsg').textContent.trim().slice(0,45);
  r['5_окно_открыто'] = open();

  document.getElementById('passInput').value = '${PW}';
  document.getElementById('lockOk').click();
  for (let i = 0; i < 120 && open(); i++) await wait(1000);
  r['6_окно_открыто'] = open();
  r['6_редактор_доступен'] = document.getElementById('dbody').contentEditable;
  r['6_кнопка_новая_активна'] = !document.getElementById('newBtn').disabled;
  r['6_записи_видны'] = document.getElementById('list').textContent.trim().slice(0,60);
  r['6_баннер_скрыт'] = disp('lockBanner');
  return r;
})()`;

require('child_process').execFile('node',
  ['/workspace/project/preview-src/cdp_run.js', 'http://localhost:8769/t-enc2.html', expr],
  { maxBuffer: 10 * 1024 * 1024 },
  (err, stdout, stderr) => {
    if (err) { console.error('ERR', stderr || err.message); return; }
    const data = JSON.parse(stdout);
    console.log('=== ДНЕВНИК ЗАШИФРОВАН (после правок) ===');
    for (const [k, v] of Object.entries(data)) console.log(`    ${k.padEnd(28)} = ${v}`);
  });
