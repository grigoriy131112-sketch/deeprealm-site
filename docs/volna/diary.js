/* Волна — личный дневник: записи, шифрование паролем, шаблоны */

const KEY = 'volna.diary.v1';          // открытые записи
const ENC_KEY = 'volna.diary.enc';     // зашифрованный конверт
const MOOD_KEY = 'volna.v1';           // отметки настроения (общие с первой страницей)
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const DAY = 86400000;

let theme = localStorage.getItem('volna.theme') || 'day';
let entries = load();
let activeId = null;
let dirty = false;
let autosaveTimer;

let locked = !!localStorage.getItem(ENC_KEY);   // есть зашифрованный конверт?
let cipher = null;                              // производный ключ, пока разблокировано

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
// Открытый текст пишем только пока шифрование выключено.
// При включённом — записи живут в памяти и уходят в конверт через writeEncrypted().
function persist() {
  try {
    if (locked) { localStorage.removeItem(KEY); return; }
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {}
}
function commit() {
  if (locked) writeEncrypted(true);
  else persist();
}

function envelope() {
  try { return JSON.parse(localStorage.getItem(ENC_KEY)); } catch { return null; }
}

/* ---------- утилиты ---------- */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function stripTags(html) { const d = document.createElement('div'); d.innerHTML = html || ''; return d.textContent || ''; }
function fmtDate(ts) {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}, ${WD[d.getDay()]}`;
}
function fmtTime(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function fmtFull(ts) {
  const d = new Date(ts);
  return `${WD[d.getDay()]}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()} · ${fmtTime(ts)}`;
}
function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function plural(n, a, b, c) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return a;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return b;
  return c;
}

let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ---------- связка с настроением ---------- */
function moodForDay(ts) {
  try {
    const data = JSON.parse(localStorage.getItem(MOOD_KEY));
    const e = data && data.entries && data.entries[dayKey(ts)];
    return e && e.mood ? e.mood : null;
  } catch { return null; }
}
function renderMoodLink() {
  const el = document.getElementById('moodLink');
  const ts = activeId ? (entries.find(x => x.id === activeId) || {}).created : Date.now();
  const v = moodForDay(ts || Date.now());
  if (!v) { el.hidden = true; el.innerHTML = ''; return; }
  const EMO = { 1: '😞', 2: '🙁', 3: '😐', 4: '🙂', 5: '😄' };
  const LBL = { 1: 'тяжело', 2: 'так себе', 3: 'нормально', 4: 'хорошо', 5: 'отлично' };
  el.hidden = false;
  el.innerHTML = `<span>В этот день настроение: ${EMO[v]} <b>${LBL[v]}</b></span>`;
}

/* ---------- серия дней письма ---------- */
function writingStreak() {
  const days = new Set(entries.map(e => dayKey(e.created)));
  let cur = new Date(); cur.setHours(0, 0, 0, 0);
  const k = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (!days.has(k(cur))) cur = new Date(cur.getTime() - DAY);
  let n = 0;
  while (days.has(k(cur))) { n++; cur = new Date(cur.getTime() - DAY); }
  return n;
}
function updateStreak() {
  document.getElementById('streakNum').textContent = writingStreak();
}

/* ---------- список ---------- */
function visibleEntries() {
  const q = document.getElementById('search').value.trim().toLowerCase();
  const list = [...entries].sort((a, b) => b.updated - a.updated);
  if (!q) return list;
  return list.filter(e =>
    (e.title || '').toLowerCase().includes(q) || stripTags(e.body).toLowerCase().includes(q));
}

function renderList() {
  const host = document.getElementById('list');
  const list = visibleEntries();
  if (list.length === 0) {
    host.innerHTML = `<div class="read__empty" style="padding:14px 4px;font-size:13.5px">
      ${entries.length ? 'Ничего не найдено.' : 'Записей пока нет. Начни с «✏️ Новая».'}</div>`;
    return;
  }
  host.innerHTML = list.map(e => {
    const text = stripTags(e.body).trim();
    const title = e.title && e.title.trim() ? e.title : 'Без заголовка';
    return `<button class="entry ${e.id === activeId ? 'is-active' : ''}" data-id="${e.id}">
      <div class="entry__top">
        <span class="entry__date">${fmtDate(e.created)}</span>
        <span class="entry__time">${fmtTime(e.created)}</span>
      </div>
      <div class="entry__title">${esc(title)}</div>
      <div class="entry__preview">${esc(text.slice(0, 140) || 'Пустая запись')}</div>
    </button>`;
  }).join('');
  host.querySelectorAll('.entry').forEach(b => { b.onclick = () => openEntry(b.dataset.id); });
}

/* ---------- редактор ---------- */
function setEditor(title, bodyHtml) {
  document.getElementById('dtitle').value = title || '';
  document.getElementById('dbody').innerHTML = bodyHtml || '';
  updateCounter();
  renderMoodLink();
}

function openEntry(id) {
  if (dirty && !confirm('В текущей записи есть несохранённые изменения. Перейти без сохранения?')) return;
  const e = entries.find(x => x.id === id);
  if (!e) return;
  activeId = id;
  setEditor(e.title, e.body);
  dirty = false;
  setSaved(false);
  renderList();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function newEntry() {
  if (dirty && !confirm('Есть несохранённые изменения. Начать новую запись без сохранения?')) return;
  activeId = null;
  setEditor('', '');
  dirty = false;
  setSaved(false);
  renderList();
  document.getElementById('dtitle').focus();
}

function currentData() {
  return {
    title: document.getElementById('dtitle').value.trim(),
    body: document.getElementById('dbody').innerHTML,
  };
}

async function saveEntry(silent) {
  const { title, body } = currentData();
  const empty = !title && !stripTags(body).trim();
  if (empty) { if (!silent) toast('Пустую запись сохранять нечего 🙂'); return; }

  const now = Date.now();
  if (activeId) {
    const e = entries.find(x => x.id === activeId);
    e.title = title; e.body = body; e.updated = now;
  } else {
    const e = { id: uid(), title, body, created: now, updated: now };
    entries.push(e);
    activeId = e.id;
  }
  commit();
  dirty = false;
  setSaved(true);
  renderList();
  updateStreak();
  renderMoodLink();
  if (!silent) toast('📓 Запись сохранена');
}

function removeEntry() {
  if (!activeId) { toast('Сначала открой запись из списка'); return; }
  if (!confirm('Удалить эту запись? Это нельзя отменить.')) return;
  entries = entries.filter(e => e.id !== activeId);
  commit();
  activeId = null;
  setEditor('', '');
  dirty = false;
  renderList();
  updateStreak();
  toast('Запись удалена');
}

function setSaved(v) {
  const f = document.getElementById('savedFlag');
  f.classList.toggle('show', v);
  if (v) setTimeout(() => f.classList.remove('show'), 1800);
}

function updateCounter() {
  const n = stripTags(document.getElementById('dbody').innerHTML).length;
  document.getElementById('counter').textContent = `${n} ${plural(n, 'символ', 'символа', 'символов')}`;
}

/* ---------- автосохранение ---------- */
function markDirty() {
  dirty = true;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    const { title, body } = currentData();
    if (title || stripTags(body).trim()) saveEntry(true);
  }, 4000);
}

/* ---------- шифрование ---------- */
async function writeEncrypted(silent) {
  if (!cipher) return;
  const payload = await cipher.seal(JSON.stringify(entries));
  localStorage.setItem(ENC_KEY, JSON.stringify(payload));
  localStorage.removeItem(KEY);   // в хранилище остаётся только шифр
  if (!silent) toast('🔐 Дневник зашифрован');
}

function setLockUI() {
  const btn = document.getElementById('lockBtn');
  btn.textContent = locked ? '🔒' : '🔓';
  btn.title = locked ? 'Дневник зашифрован' : 'Зашифровать дневник паролем';

  const ro = locked && !cipher;   // заперто и пароль ещё не введён
  document.getElementById('dbody').contentEditable = !ro;
  document.getElementById('dtitle').disabled = ro;
  ['newBtn', 'tplBtn', 'saveBtn', 'deleteBtn', 'printBtn', 'promptBtn', 'importBtn', 'search']
    .forEach(id => { const el = document.getElementById(id); if (el) el.disabled = ro; });

  const banner = document.getElementById('lockBanner');
  if (ro) {
    banner.hidden = false;
    document.getElementById('lockBannerText').textContent = '🔒 Записи зашифрованы. Введи пароль, чтобы их увидеть.';
  } else {
    banner.hidden = true;
  }
}

let lockMode = 'unlock';   // 'unlock' | 'set' | 'change'
function openLockDialog(mode) {
  lockMode = mode;
  const first = mode !== 'unlock';
  document.getElementById('lockTitle').textContent =
    mode === 'unlock' ? '🔐 Дневник зашифрован' : mode === 'set' ? '🔐 Зашифровать дневник' : '🔐 Сменить пароль';
  document.getElementById('lockSub').textContent =
    mode === 'unlock' ? 'Введи пароль, чтобы открыть записи' : 'Придумай пароль — записи будут храниться в шифре';
  ['passInput', 'passInput2'].forEach(id => {
    const el = document.getElementById(id);
    el.value = '';
    el.type = 'password';
    el.style.borderColor = '';
  });
  document.getElementById('passEye1').textContent = '👁';
  document.getElementById('passEye2').textContent = '👁';
  document.getElementById('passRow2').hidden = !first;
  document.getElementById('lockMsg').textContent = '';
  document.getElementById('lockOverlay').classList.add('open');
  setTimeout(() => document.getElementById('passInput').focus(), 60);
}
function closeLockDialog() { document.getElementById('lockOverlay').classList.remove('open'); }

function lockError(text, field) {
  const msg = document.getElementById('lockMsg');
  msg.textContent = text;
  if (field) { const el = document.getElementById(field); el.style.borderColor = 'var(--m1)'; el.focus(); }
}

async function submitLock() {
  const p1 = document.getElementById('passInput').value;
  const p2 = document.getElementById('passInput2').value;
  const msg = document.getElementById('lockMsg');
  msg.textContent = '';

  if (lockMode === 'unlock') {
    if (!p1) { lockError('Введи пароль', 'passInput'); return; }
    msg.textContent = 'Проверяю…';
    try {
      const env = envelope();
      const c = await Vault.makeCipher(p1, env.salt);
      const text = await c.open(env);
      entries = JSON.parse(text);
      cipher = c;
      locked = true;
      localStorage.removeItem(KEY);   // открытая копия не должна переживать разблокировку
      closeLockDialog();
      afterUnlock();
      toast('🔓 Дневник открыт');
    } catch {
      lockError('Неверный пароль. Проверь раскладку и регистр.', 'passInput');
    }
    return;
  }

  // set / change
  if (!p1) { lockError('Придумай пароль', 'passInput'); return; }
  if (p1.length < 4) { lockError('Пароль слишком короткий — минимум 4 символа', 'passInput'); return; }
  if (p1 !== p2) {
    lockError(
      p1.trim() === p2.trim()
        ? 'Пароли различаются только пробелом в начале или конце — убери его'
        : 'Пароли не совпадают — нажми 👁, чтобы увидеть, что ввёл. Регистр букв важен',
      'passInput2'
    );
    return;
  }
  msg.textContent = 'Шифрую…';
  try {
    cipher = await Vault.makeCipher(p1);
    locked = true;
    await writeEncrypted(true);
    closeLockDialog();
    afterUnlock();
    toast(lockMode === 'set' ? '🔐 Дневник зашифрован' : '🔐 Пароль обновлён');
  } catch {
    lockError('Ошибка шифрования. Попробуй ещё раз.', 'passInput');
  }
}

function afterUnlock() {
  setLockUI();
  renderList();
  updateStreak();
  renderMoodLink();
}

function toggleLock() {
  if (!Vault.available) { toast('Браузер не поддерживает шифрование'); return; }
  if (!locked) { openLockDialog('set'); return; }
  if (cipher) { openLockDialog('change'); return; }
  openLockDialog('unlock');
}

/* ---------- шаблоны и вопрос дня ---------- */
function openTemplates() {
  document.getElementById('tplList').innerHTML = TEMPLATES.map((t, i) =>
    `<button class="tpl" data-i="${i}">
       <div class="tpl__name">${t.name}</div>
       <div class="tpl__desc">${t.desc}</div>
     </button>`).join('');
  document.getElementById('tplList').querySelectorAll('.tpl').forEach(b => {
    b.onclick = () => applyTemplate(TEMPLATES[+b.dataset.i]);
  });
  document.getElementById('tplOverlay').classList.add('open');
}

function applyTemplate(t) {
  document.getElementById('tplOverlay').classList.remove('open');
  const body = document.getElementById('dbody');
  const text = t.text.trim();
  if (!text) { newEntry(); return; }
  const html = text.split('\n').map(l => l.trim() ? `<div>${esc(l)}</div>` : '<div><br></div>').join('');
  if (dirty && stripTags(body.innerHTML).trim() &&
      !confirm('Заменить текущий текст шаблоном?')) return;
  body.innerHTML = html;
  dirty = true;
  updateCounter();
  body.classList.toggle('is-empty', false);
  body.focus();
  toast('🧩 Шаблон подставлен');
}

function todaysPrompt() {
  const d = new Date();
  const seed = Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / DAY);
  return PROMPTS[seed % PROMPTS.length];
}

function usePrompt() {
  const q = todaysPrompt();
  const body = document.getElementById('dbody');
  body.innerHTML += `<div><b>${esc(q)}</b></div><div><br></div>`;
  dirty = true;
  updateCounter();
  body.classList.toggle('is-empty', false);
  body.focus();
}

/* ---------- печать ---------- */
function openPreview(id) {
  const e = entries.find(x => x.id === id);
  if (!e) return;
  document.getElementById('pvTitle').textContent = e.title || 'Без заголовка';
  document.getElementById('pvDate').textContent = fmtFull(e.created);
  document.getElementById('pvBody').innerHTML = e.body || '<span class="read__empty">Пусто</span>';
  document.getElementById('overlay').classList.add('open');
}
function printCurrent() {
  const { title, body } = currentData();
  if (!activeId && !title && !stripTags(body).trim()) { toast('Нечего печатать'); return; }
  document.getElementById('pvTitle').textContent = title || 'Без заголовка';
  document.getElementById('pvDate').textContent = activeId
    ? fmtFull((entries.find(x => x.id === activeId) || {}).created || Date.now())
    : fmtFull(Date.now());
  document.getElementById('pvBody').innerHTML = body || '<span class="read__empty">Пусто</span>';
  document.getElementById('overlay').classList.add('open');
}
function closeModal() { document.getElementById('overlay').classList.remove('open'); }

/* ---------- экспорт / импорт ---------- */
function exportAll() {
  if (!entries.length) { toast('Пока нечего выгружать'); return; }
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `volna-diary-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('⬇ Резервная копия скачана');
}

function importAll(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data)) throw new Error('bad');
      const ids = new Set(entries.map(e => e.id));
      let added = 0;
      data.forEach(e => {
        if (!e || typeof e !== 'object') return;
        const id = e.id && !ids.has(e.id) ? e.id : uid();
        ids.add(id);
        entries.push({
          id,
          title: String(e.title || ''),
          body: String(e.body || ''),
          created: Number(e.created) || Date.now(),
          updated: Number(e.updated) || Number(e.created) || Date.now(),
        });
        added++;
      });
      commit(); renderList(); updateStreak();
      toast(`⬆ Загружено записей: ${added}`);
    } catch { toast('Не удалось прочитать файл'); }
  };
  reader.readAsText(file);
}

/* ---------- тема ---------- */
function applyTheme() {
  document.documentElement.dataset.theme = theme;
  document.getElementById('themeBtn').textContent = theme === 'night' ? '☀️' : '🌙';
}

/* ---------- init ---------- */
function init() {
  applyTheme();
  renderList();
  updateStreak();
  document.getElementById('promptQ').textContent = todaysPrompt();

  const env = envelope();
  if (env && env.salt) { locked = true; setLockUI(); openLockDialog('unlock'); }
  else { locked = false; setLockUI(); }

  const body = document.getElementById('dbody');
  const syncPlaceholder = () => body.classList.toggle('is-empty', !stripTags(body.innerHTML).trim());
  syncPlaceholder();

  body.addEventListener('input', () => { markDirty(); updateCounter(); syncPlaceholder(); });
  document.getElementById('dtitle').addEventListener('input', markDirty);
  document.getElementById('search').addEventListener('input', renderList);

  document.getElementById('newBtn').onclick = newEntry;
  document.getElementById('tplBtn').onclick = openTemplates;
  document.getElementById('tplClose').onclick = () => document.getElementById('tplOverlay').classList.remove('open');
  document.getElementById('tplOverlay').onclick = e => {
    if (e.target.id === 'tplOverlay') e.target.classList.remove('open');
  };
  document.getElementById('promptBtn').onclick = usePrompt;
  document.getElementById('saveBtn').onclick = () => saveEntry(false);
  document.getElementById('deleteBtn').onclick = removeEntry;
  document.getElementById('printBtn').onclick = printCurrent;
  document.getElementById('exportBtn').onclick = exportAll;
  document.getElementById('importBtn').onclick = () => document.getElementById('importFile').click();
  document.getElementById('importFile').onchange = e => {
    if (e.target.files[0]) importAll(e.target.files[0]);
    e.target.value = '';
  };

  document.getElementById('closeBtn').onclick = closeModal;
  document.getElementById('closeBtn2').onclick = closeModal;
  document.getElementById('overlay').onclick = e => { if (e.target.id === 'overlay') closeModal(); };
  document.getElementById('doPrint').onclick = () => window.print();

  document.getElementById('lockBtn').onclick = toggleLock;
  document.getElementById('unlockBtn').onclick = () => openLockDialog('unlock');
  document.getElementById('lockOk').onclick = submitLock;
  document.getElementById('lockCancel').onclick = closeLockDialog;
  document.getElementById('lockClose').onclick = closeLockDialog;
  document.getElementById('passInput').addEventListener('keydown', e => { if (e.key === 'Enter') submitLock(); });
  document.getElementById('passInput2').addEventListener('keydown', e => { if (e.key === 'Enter') submitLock(); });
  [['passEye1', 'passInput'], ['passEye2', 'passInput2']].forEach(([eyeId, inputId]) => {
    document.getElementById(eyeId).onclick = () => {
      const el = document.getElementById(inputId);
      const shown = el.type === 'text';
      el.type = shown ? 'password' : 'text';
      document.getElementById(eyeId).textContent = shown ? '👁' : '🙈';
      el.focus();
    };
  });
  document.getElementById('passInput2').addEventListener('input', () => {
    const p1 = document.getElementById('passInput').value;
    const p2 = document.getElementById('passInput2').value;
    const msg = document.getElementById('lockMsg');
    if (p2 && p1 !== p2) msg.textContent = 'Пока не совпадают…';
    else if (msg.textContent === 'Пока не совпадают…') msg.textContent = '';
  });

  document.getElementById('themeBtn').onclick = () => {
    theme = theme === 'night' ? 'day' : 'night';
    localStorage.setItem('volna.theme', theme);
    applyTheme();
  };

  document.querySelectorAll('#fmtBar .tool').forEach(b => {
    b.onmousedown = e => e.preventDefault();   // не терять выделение
    b.onclick = () => {
      body.focus();
      document.execCommand(b.dataset.cmd, false, b.dataset.val || null);
      markDirty(); updateCounter(); syncPlaceholder();
    };
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal(); closeLockDialog(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveEntry(false); }
  });

  window.addEventListener('beforeunload', e => {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });
}

init();
