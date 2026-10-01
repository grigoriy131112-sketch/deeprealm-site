/* ВОЛНА — логика дневника настроения */

const SAVE_KEY = 'volna.v1';
const DAY = 86400000;

let state = load();
let view = new Date();          // месяц, который показываем
view.setDate(1);
let picked = { mood: null, tags: [], note: '' };
let hydrated = false;
let theme = localStorage.getItem('volna.theme') || 'day';

function blankState() { return { entries: {} }; }
function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? Object.assign(blankState(), JSON.parse(raw)) : blankState();
  } catch { return blankState(); }
}
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch {} }

/* ---------- даты ---------- */
function key(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function todayKey() { return key(new Date()); }
function parseKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
function isFuture(d) { const t = new Date(); t.setHours(0, 0, 0, 0); return d > t; }
function moodOf(v) { return MOODS.find(m => m.v === v) || MOODS[2]; }
function prettyDate(d) {
  return `${WEEKDAYS_FULL[(d.getDay() + 6) % 7]}, ${d.getDate()} ${MONTHS[d.getMonth()].toLowerCase()} ${d.getFullYear()}`;
}

/* ---------- серия ---------- */
function streak() {
  const e = state.entries;
  let cur = new Date(); cur.setHours(0, 0, 0, 0);
  if (!e[key(cur)]) cur = new Date(cur.getTime() - DAY);
  let n = 0;
  while (e[key(cur)]) { n++; cur = new Date(cur.getTime() - DAY); }
  return n;
}

/* ---------- сегодняшняя форма ---------- */
function renderForm() {
  const k = todayKey();
  const existing = state.entries[k];
  if (existing && !hydrated) {
    picked = { mood: existing.mood, tags: [...(existing.tags || [])], note: existing.note || '' };
    hydrated = true;
  }

  const host = document.getElementById('moods');
  host.innerHTML = MOODS.map(m => `
    <button class="mood ${picked.mood === m.v ? 'on' : ''}" data-v="${m.v}">
      <span class="mood__emoji">${m.emoji}</span>
      <span class="mood__label">${m.label}</span>
    </button>`).join('');
  host.querySelectorAll('.mood').forEach(b => {
    b.onclick = () => { picked.mood = +b.dataset.v; renderForm(); };
  });

  const tags = document.getElementById('tags');
  tags.innerHTML = TAGS.map(t => `
    <button class="tag ${picked.tags.includes(t.id) ? 'on' : ''}" data-id="${t.id}">
      <span>${t.emoji}</span>${t.label}
    </button>`).join('');
  tags.querySelectorAll('.tag').forEach(b => {
    b.onclick = () => {
      const id = b.dataset.id;
      picked.tags = picked.tags.includes(id) ? picked.tags.filter(x => x !== id) : [...picked.tags, id];
      renderForm();
    };
  });

  const note = document.getElementById('note');
  if (note.value !== picked.note) note.value = picked.note;
  note.oninput = () => { picked.note = note.value; };

  document.getElementById('saveBtn').disabled = picked.mood === null;
  document.getElementById('saveBtn').textContent = existing ? '💾 Обновить день' : '💾 Сохранить день';

  const d = new Date();
  document.getElementById('todayKicker').textContent = `${WEEKDAYS[(d.getDay() + 6) % 7]}, ${d.getDate()} ${MONTHS[d.getMonth()].toLowerCase()}`;
  if (existing) {
    document.getElementById('heroSub').textContent =
      `Ты уже отметил(а) сегодня: ${moodOf(existing.mood).emoji} ${moodOf(existing.mood).label.toLowerCase()}. Можно поправить.`;
  }
}

function saveDay() {
  if (picked.mood === null) return;
  const k = todayKey();
  const isNew = !state.entries[k];
  state.entries[k] = { mood: picked.mood, tags: [...picked.tags], note: picked.note.trim() };
  save();
  renderAll();
  if (isNew) { confetti(); toast('🌊 День записан. До завтра!'); }
  else toast('✅ Обновлено');
}

function clearDay() {
  picked = { mood: null, tags: [], note: '' };
  document.getElementById('note').value = '';
  renderForm();
}

/* ---------- календарь ---------- */
function renderCalendar() {
  const y = view.getFullYear(), m = view.getMonth();
  document.getElementById('calMonth').textContent = `${MONTHS[m]} ${y}`;

  const dow = document.getElementById('calDow');
  dow.innerHTML = WEEKDAYS.map(w => `<div>${w}</div>`).join('');

  const first = new Date(y, m, 1);
  const startShift = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';
  for (let i = 0; i < startShift; i++) {
    grid.insertAdjacentHTML('beforeend', '<div class="day empty"></div>');
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y, m, d);
    const k = key(date);
    const e = state.entries[k];
    const cls = ['day'];
    if (isFuture(date)) cls.push('future');
    if (k === todayKey()) cls.push('today');
    const el = document.createElement('button');
    el.className = cls.join(' ');
    el.dataset.k = k;
    if (e) {
      el.dataset.v = e.mood;
      el.innerHTML = `<span class="day__n">${d}</span><span class="day__e">${moodOf(e.mood).emoji}</span>`;
      el.title = `${d} ${MONTHS[m].toLowerCase()}: ${moodOf(e.mood).label}`;
    } else {
      el.innerHTML = `<span class="day__n">${d}</span>`;
    }
    el.onclick = () => openDay(k);
    grid.appendChild(el);
  }
}

function openDay(k) {
  const e = state.entries[k];
  const date = parseKey(k);
  document.getElementById('modalTitle').textContent = `${date.getDate()} ${MONTHS[date.getMonth()].toLowerCase()}`;
  document.getElementById('modalDate').textContent = prettyDate(date);
  const body = document.getElementById('modalBody');

  if (!e) {
    body.innerHTML = `<div class="empty-state">😶 На этот день записи нет.</div>`;
  } else {
    const tags = (e.tags || []).map(id => TAGS.find(t => t.id === id)).filter(Boolean);
    body.innerHTML = `
      <div class="day-preview">
        <span class="day-preview__e">${moodOf(e.mood).emoji}</span>
        <div>
          <div class="day-preview__lbl">${moodOf(e.mood).label}</div>
          <div class="day-preview__tags">${tags.map(t => `<span>${t.emoji} ${t.label}</span>`).join('') || '<span>без тегов</span>'}</div>
        </div>
      </div>
      <div class="label">Заметка</div>
      <div class="day-note ${e.note ? '' : 'empty'}">${e.note ? escapeHtml(e.note) : 'Заметки нет'}</div>`;
  }
  document.getElementById('overlay').classList.add('open');
}

function closeModal() { document.getElementById('overlay').classList.remove('open'); }

/* ---------- статистика ---------- */
function entriesArr() {
  return Object.entries(state.entries).map(([k, e]) => ({ k, date: parseKey(k), ...e }));
}

function renderInsights() {
  const all = entriesArr();
  const host = document.getElementById('insights');
  if (all.length === 0) {
    host.innerHTML = `<div class="insight" style="grid-column:1/-1"><div class="insight__val">—</div>
      <div class="insight__lbl">пока пусто</div>
      <div class="insight__sub">Отметь первое настроение — и здесь появятся инсайты.</div></div>`;
    return;
  }

  const avg = all.reduce((s, e) => s + e.mood, 0) / all.length;
  const best = all.reduce((a, b) => (b.mood > a.mood ? b : a));
  const worst = all.reduce((a, b) => (b.mood < a.mood ? b : a));

  // теги: среднее настроение и частота
  const tagStats = TAGS.map(t => {
    const withTag = all.filter(e => (e.tags || []).includes(t.id));
    if (!withTag.length) return null;
    return { t, n: withTag.length, avg: withTag.reduce((s, e) => s + e.mood, 0) / withTag.length };
  }).filter(Boolean).sort((a, b) => b.n - a.n);

  const topTag = tagStats[0];
  const lift = tagStats.filter(x => x.n >= 3).sort((a, b) => b.avg - a.avg)[0];
  const drag = tagStats.filter(x => x.n >= 3).sort((a, b) => a.avg - b.avg)[0];

  const avgMood = moodOf(Math.round(avg));
  const cards = [
    { ico: '🌊', val: avg.toFixed(1), lbl: 'среднее настроение', sub: `${avgMood.emoji} ближе к «${avgMood.label.toLowerCase()}»` },
    { ico: '📔', val: all.length, lbl: 'дней записано', sub: `из ${daysSinceFirst(all)} дней наблюдения` },
    { ico: '🔥', val: streak(), lbl: 'дней подряд', sub: 'серия без пропусков' },
    { ico: '🏆', val: `${best.date.getDate()}.${String(best.date.getMonth() + 1).padStart(2, '0')}`, lbl: 'лучший день', sub: `${moodOf(best.mood).emoji} ${moodOf(best.mood).label.toLowerCase()}` },
    { ico: '📉', val: `${worst.date.getDate()}.${String(worst.date.getMonth() + 1).padStart(2, '0')}`, lbl: 'тяжёлый день', sub: `${moodOf(worst.mood).emoji} ${moodOf(worst.mood).label.toLowerCase()}` },
  ];
  if (topTag) cards.push({ ico: topTag.t.emoji, val: topTag.t.label, lbl: 'частый тег', sub: `${topTag.n} раз(а)` });
  if (lift) cards.push({ ico: '⬆️', val: lift.t.label, lbl: 'поднимает настроение', sub: `среднее ${lift.avg.toFixed(1)}` });
  if (drag && drag.t.id !== lift?.t.id) cards.push({ ico: '⬇️', val: drag.t.label, lbl: 'тянет вниз', sub: `среднее ${drag.avg.toFixed(1)}` });

  host.innerHTML = cards.map(c => `
    <div class="insight">
      <div class="insight__ico">${c.ico}</div>
      <div class="insight__val">${c.val}</div>
      <div class="insight__lbl">${c.lbl}</div>
      <div class="insight__sub">${c.sub}</div>
    </div>`).join('');

  const days = daysSinceFirst(all);
  document.getElementById('insightRange').textContent = `за ${days} дн. наблюдения`;
}

function daysSinceFirst(all) {
  const min = Math.min(...all.map(e => e.date.getTime()));
  const d0 = new Date(min); d0.setHours(0, 0, 0, 0);
  const d1 = new Date(); d1.setHours(0, 0, 0, 0);
  return Math.round((d1 - d0) / DAY) + 1;
}

function renderWeekChart() {
  const all = entriesArr();
  const sums = Array(7).fill(0), counts = Array(7).fill(0);
  all.forEach(e => { const wd = (e.date.getDay() + 6) % 7; sums[wd] += e.mood; counts[wd]++; });

  document.getElementById('weekChart').innerHTML = WEEKDAYS.map((w, i) => {
    const avg = counts[i] ? sums[i] / counts[i] : 0;
    const h = avg ? Math.max(8, (avg / 5) * 100) : 4;
    return `<div class="wk__col" title="${WEEKDAYS_FULL[i]}: ${avg ? avg.toFixed(1) : '—'}">
      <div class="wk__bar" style="height:${h}%"></div>
      <div class="wk__lbl">${w}</div>
    </div>`;
  }).join('');
}

function renderDist() {
  const all = entriesArr();
  const host = document.getElementById('dist');
  if (!all.length) { host.innerHTML = '<div class="empty-state">Пока нет данных.</div>'; return; }
  const counts = MOODS.map(m => ({ m, n: all.filter(e => e.mood === m.v).length }));
  const max = Math.max(1, ...counts.map(c => c.n));
  host.innerHTML = counts.map(c => `
    <div class="dist__row">
      <div class="dist__e">${c.m.emoji}</div>
      <div class="dist__track"><div class="dist__fill" style="width:${(c.n / max) * 100}%;background:var(--m${c.m.v})"></div></div>
      <div class="dist__n">${c.n}</div>
    </div>`).join('');
}

/* ---------- график настроения ---------- */
let chartRange = 30;

function renderChart() {
  const host = document.getElementById('moodChart');
  const all = entriesArr();
  if (all.length < 2) {
    host.innerHTML = '<div class="chart__empty">Нужно хотя бы два дня с отметками, чтобы построить график.</div>';
    return;
  }

  const days = chartRange;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(today.getTime() - (days - 1) * DAY);
  const map = new Map(all.map(e => [e.k, e.mood]));

  const pts = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * DAY);
    const v = map.get(key(d));
    pts.push({ d, v: v || null });
  }
  const known = pts.filter(p => p.v !== null);
  if (known.length < 2) {
    host.innerHTML = '<div class="chart__empty">В выбранном периоде мало данных. Попробуй 90 дней.</div>';
    return;
  }

  const W = 720, H = 240, padL = 30, padR = 14, padT = 16, padB = 26;
  const x = i => padL + (i / (days - 1)) * (W - padL - padR);
  const y = v => padT + ((5 - v) / 4) * (H - padT - padB);

  const idxKnown = pts.map((p, i) => (p.v !== null ? i : -1)).filter(i => i >= 0);
  const line = idxKnown.map((i, n) => `${n === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(pts[i].v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(idxKnown[idxKnown.length - 1]).toFixed(1)},${H - padB} L${x(idxKnown[0]).toFixed(1)},${H - padB} Z`;

  const grid = [1, 2, 3, 4, 5].map(v => {
    const yy = y(v).toFixed(1);
    return `<line class="chart__grid" x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}"/>
            <text class="chart__lbl" x="${padL - 8}" y="${(+yy + 3).toFixed(1)}" text-anchor="end">${v}</text>`;
  }).join('');

  const dots = idxKnown.map(i =>
    `<circle class="chart__dot" cx="${x(i).toFixed(1)}" cy="${y(pts[i].v).toFixed(1)}" r="4">
       <title>${key(pts[i].d)}: ${moodOf(pts[i].v).label}</title></circle>`).join('');

  host.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="График настроения за ${days} дней">
      <defs>
        <linearGradient id="moodGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--m5)" stop-opacity=".38"/>
          <stop offset="100%" stop-color="var(--m5)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${grid}
      <path class="chart__area" d="${area}"/>
      <path class="chart__line" d="${line}"/>
      ${dots}
      <text class="chart__lbl" x="${padL}" y="${H - 6}">${key(start)}</text>
      <text class="chart__lbl" x="${W - padR}" y="${H - 6}" text-anchor="end">сегодня</text>
    </svg>`;
}

/* ---------- достижения ---------- */
function achievements() {
  const all = entriesArr();
  const words = all.reduce((s, e) => s + (e.note ? e.note.trim().split(/\s+/).filter(Boolean).length : 0), 0);
  const best = all.reduce((a, b) => Math.max(a, b.mood), 0);
  const list = [
    { ico: '🌱', name: 'Первый шаг', hint: '1 день с отметкой', got: all.length >= 1 },
    { ico: '🔥', name: 'Неделя подряд', hint: '7 дней серии', got: streak() >= 7 },
    { ico: '⚡', name: 'Месяц подряд', hint: '30 дней серии', got: streak() >= 30 },
    { ico: '📔', name: 'Дневниковед', hint: '10 дней записано', got: all.length >= 10 },
    { ico: '🗓', name: 'Летописец', hint: '50 дней записано', got: all.length >= 50 },
    { ico: '✍️', name: 'Писатель', hint: '1000 слов в заметках', got: words >= 1000 },
    { ico: '🏆', name: 'На подъёме', hint: 'отметить «отлично»', got: best === 5 },
    { ico: '🎯', name: 'Разнообразие', hint: 'использовать 6 разных тегов', got: usedTags() >= 6 },
  ];
  const got = list.filter(a => a.got).length;
  document.getElementById('achSummary').textContent = `${got} из ${list.length}`;
  document.getElementById('achievements').innerHTML = list.map(a => `
    <div class="ach__item ${a.got ? 'got' : ''}" title="${a.got ? 'Получено!' : a.hint}">
      <span class="ach__ico">${a.got ? a.ico : '🔒'}</span>
      <div class="ach__name">${a.name}</div>
      <div class="ach__hint">${a.hint}</div>
    </div>`).join('');
}

function usedTags() {
  const s = new Set();
  Object.values(state.entries).forEach(e => (e.tags || []).forEach(t => s.add(t)));
  return s.size;
}

/* ---------- вспомогательное ---------- */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function confetti() {
  const host = document.getElementById('confetti');
  const colors = ['#FF7A7A', '#FFAE5C', '#FFD84D', '#9BE07A', '#45D6A6', '#8FC7FF'];
  for (let i = 0; i < 32; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + 'vw';
    p.style.top = '-16px';
    p.style.background = colors[i % colors.length];
    p.style.animationDuration = (1.5 + Math.random() * 1.3) + 's';
    p.style.animationDelay = (Math.random() * 0.3) + 's';
    host.appendChild(p);
    setTimeout(() => p.remove(), 3200);
  }
}

function applyTheme() {
  document.documentElement.dataset.theme = theme;
  document.getElementById('themeBtn').textContent = theme === 'night' ? '☀️' : '🌙';
}

function renderAll() {
  renderForm();
  renderCalendar();
  renderInsights();
  renderChart();
  renderWeekChart();
  renderDist();
  achievements();
  document.getElementById('streakNum').textContent = streak();
}

/* ---------- init ---------- */
function init() {
  applyTheme();
  renderAll();

  document.getElementById('saveBtn').onclick = saveDay;
  document.getElementById('clearBtn').onclick = clearDay;
  document.getElementById('closeBtn').onclick = closeModal;
  document.getElementById('overlay').onclick = e => { if (e.target.id === 'overlay') closeModal(); };

  document.getElementById('prevMonth').onclick = () => { view.setMonth(view.getMonth() - 1); renderCalendar(); };
  document.getElementById('nextMonth').onclick = () => { view.setMonth(view.getMonth() + 1); renderCalendar(); };

  document.getElementById('rangeSeg').querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      chartRange = +b.dataset.r;
      document.getElementById('rangeSeg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      renderChart();
    };
  });

  document.getElementById('remindBtn').onclick = () => {
    const cfg = Reminder.get();
    document.getElementById('remindTime').value = cfg && cfg.at ? cfg.at : '20:00';
    const hint = document.getElementById('remindHint');
    if (!Reminder.supported()) hint.textContent = 'Этот браузер не поддерживает уведомления.';
    else if (Notification.permission === 'denied') hint.textContent = 'Уведомления запрещены в настройках сайта — разреши их в браузере.';
    else hint.textContent = 'Уведомление придёт, пока вкладка открыта. Если день уже отмечен — не побеспокою.';
    document.getElementById('remindOverlay').classList.add('open');
  };
  const closeRemind = () => document.getElementById('remindOverlay').classList.remove('open');
  document.getElementById('remindClose').onclick = closeRemind;
  document.getElementById('remindOverlay').onclick = e => {
    if (e.target.id === 'remindOverlay') closeRemind();
  };
  document.getElementById('remindSave').onclick = async () => {
    const at = document.getElementById('remindTime').value;
    if (!at) { toast('Выбери время'); return; }
    if (!(await Reminder.ask())) { toast('Разреши уведомления в браузере'); return; }
    Reminder.set({ at, mode: 'mood' });
    closeRemind();
    toast(`🔔 Напомню в ${at}`);
  };
  document.getElementById('remindOff').onclick = () => {
    Reminder.set(null);
    closeRemind();
    toast('Напоминание выключено');
  };

  document.getElementById('themeBtn').onclick = () => {
    theme = theme === 'night' ? 'day' : 'night';
    localStorage.setItem('volna.theme', theme);
    applyTheme();
  };
  document.getElementById('resetBtn').onclick = () => {
    if (confirm('Стереть все записи? Это нельзя отменить.')) {
      state = blankState(); save();
      picked = { mood: null, tags: [], note: '' };
      document.getElementById('note').value = '';
      renderAll(); toast('Всё стёрто');
    }
  };

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal(); document.getElementById('remindOverlay').classList.remove('open'); }
  });

  // напоминания: не будим, если день уже отмечен, и догоняем после сна вкладки
  Reminder.setGuard(() => !state.entries[todayKey()]);
  Reminder.start();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) Reminder.catchUp(); });
  window.addEventListener('focus', () => Reminder.catchUp());
}

init();
