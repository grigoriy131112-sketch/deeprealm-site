const expr = `(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  await wait(600);
  const disp = id => getComputedStyle(document.getElementById(id)).display;
  const open = () => document.getElementById('lockOverlay').classList.contains('open');
  const r = {};

  r['1_баннер_скрыт'] = disp('lockBanner');
  r['2_окно_пароля_закрыто'] = open();
  r['3_редактор_доступен'] = document.getElementById('dbody').contentEditable;

  // открываем диалог установки пароля — тут крестик и «Отмена» ДОЛЖНЫ быть
  document.getElementById('lockBtn').click(); await wait(80);
  r['4_окно_установки_открыто'] = open();
  r['4_заголовок'] = document.getElementById('lockTitle').textContent.trim();
  r['4_поле_повтора_видно'] = disp('passRow2') !== 'none';
  r['4_крестик_виден'] = disp('lockClose') !== 'none';
  r['4_отмена_видна'] = disp('lockCancel') !== 'none';

  // можно передумать и закрыть
  document.getElementById('lockCancel').click(); await wait(80);
  r['5_отмена_закрыла'] = !open();
  r['5_дневник_не_зашифрован'] = document.getElementById('lockBtn').textContent.trim();

  // а теперь ставим пароль по-настоящему
  document.getElementById('lockBtn').click(); await wait(80);
  document.getElementById('passInput').value = 'test1234';
  document.getElementById('passInput2').value = 'test1234';
  document.getElementById('lockOk').click();
  for (let i = 0; i < 60 && open(); i++) await wait(1000);
  r['6_окно_закрыто'] = !open();
  r['6_значок_замка'] = document.getElementById('lockBtn').textContent.trim();
  r['6_баннер_скрыт'] = disp('lockBanner');
  r['6_в_хранилище_есть_шифр'] = !!localStorage.getItem('volna.diary.enc');
  r['6_открытого_текста_нет'] = !localStorage.getItem('volna.diary.v1');
  return r;
})()`;

require('child_process').execFile('node',
  ['/workspace/project/preview-src/cdp_run.js', 'http://localhost:8769/t-plain2.html', expr],
  { maxBuffer: 10 * 1024 * 1024 },
  (err, stdout, stderr) => {
    if (err) { console.error('ERR', stderr || err.message); return; }
    const data = JSON.parse(stdout);
    console.log('=== ДНЕВНИК НЕ ЗАШИФРОВАН: проверка установки пароля ===');
    for (const [k, v] of Object.entries(data)) console.log(`    ${k.padEnd(28)} = ${v}`);
  });
