/* =========================================================================
   СЦЕНЫ ЛОКАЦИЙ — векторные пейзажи за спиной монстра.
   Каждая сцена: слои дальнего плана (небо, луна, силуэты), среднего
   (постройки, стволы, сталагмиты) и переднего (трава, кости, камни).
   Палитра монохромная: тёмно-серые силуэты на почти чёрном небе.
   ========================================================================= */
window.SCENES = (function () {
'use strict';

/* ---------- мелкие помощники ---------- */
const rnd = (a, b) => a + Math.random() * (b - a);
const irnd = (a, b) => Math.floor(rnd(a, b + 1));

/* звёзды */
function stars(n, ymax) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = rnd(0, 400), y = rnd(0, ymax), r = rnd(0.6, 1.6);
    s += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r.toFixed(1) + '" fill="#fff" opacity="' +
      rnd(0.2, 0.75).toFixed(2) + '"><animate attributeName="opacity" values="0.2;0.8;0.2" dur="' +
      rnd(2, 5).toFixed(1) + 's" repeatCount="indefinite"/></circle>';
  }
  return s;
}

/* луна с кратерами и ореолом */
function moon(cx, cy, r, col) {
  const c = col || '#d8d4cc';
  return '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r * 2.6) + '" fill="' + c + '" opacity=".06"/>' +
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r * 1.7) + '" fill="' + c + '" opacity=".08"/>' +
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + c + '" opacity=".9"/>' +
    '<circle cx="' + (cx - r * 0.3) + '" cy="' + (cy - r * 0.25) + '" r="' + (r * 0.22) + '" fill="#000" opacity=".14"/>' +
    '<circle cx="' + (cx + r * 0.35) + '" cy="' + (cy + r * 0.2) + '" r="' + (r * 0.15) + '" fill="#000" opacity=".12"/>' +
    '<circle cx="' + (cx + r * 0.1) + '" cy="' + (cy + r * 0.45) + '" r="' + (r * 0.1) + '" fill="#000" opacity=".1"/>';
}

/* туман у земли */
function fog(y, col, op) {
  return '<ellipse cx="200" cy="' + y + '" rx="260" ry="34" fill="' + col + '" opacity="' + op + '">' +
    '<animate attributeName="cx" values="200;230;200" dur="22s" repeatCount="indefinite"/></ellipse>' +
    '<ellipse cx="140" cy="' + (y + 14) + '" rx="200" ry="24" fill="' + col + '" opacity="' + (op * 0.7).toFixed(2) + '">' +
    '<animate attributeName="cx" values="140;110;140" dur="17s" repeatCount="indefinite"/></ellipse>';
}

/* ============================== НОЧНЫЕ ПОЛЯ ============================== */
function fields() {
  let crop = '';
  for (let i = 0; i < 46; i++) {
    const x = rnd(0, 400), y = rnd(212, 240), h = rnd(16, 34);
    crop += '<path d="M' + x.toFixed(1) + ' ' + y.toFixed(1) + ' q' + rnd(-5, 5).toFixed(1) + ' ' + (-h * 0.6).toFixed(1) +
      ' ' + rnd(-8, 8).toFixed(1) + ' ' + (-h).toFixed(1) + '" stroke="#2a2c30" stroke-width="1.6" fill="none"/>' +
      '<animateTransform attributeName="transform" type="rotate" values="-2 ' + x.toFixed(1) + ' ' + y.toFixed(1) + ';2 ' +
      x.toFixed(1) + ' ' + y.toFixed(1) + ';-2 ' + x.toFixed(1) + ' ' + y.toFixed(1) + '" dur="' + rnd(4, 8).toFixed(1) + 's" repeatCount="indefinite"/>';
  }
  let fence = '';
  for (let i = 0; i < 9; i++) {
    const x = 30 + i * 44;
    fence += '<path d="M' + x + ' 236 L' + x + ' 196" stroke="#1a1c20" stroke-width="4"/>' +
      '<path d="M' + (x - 5) + ' 202 L' + (x + 5) + ' 200 L' + (x + 5) + ' 194 L' + (x - 5) + ' 196Z" fill="#1a1c20"/>';
  }
  return '<rect width="400" height="260" fill="url(#skFields)"/>' +
    stars(70, 150) + moon(320, 56, 26) +
    /* далёкие деревья */
    '<path d="M0 214 q30 -26 60 -10 q26 -22 56 -4 q30 -18 62 2 q30 -20 64 0 q28 -16 58 4 q30 -14 60 4 L400 260 L0 260Z" fill="#0c0d10"/>' +
    /* поле */
    '<rect y="216" width="400" height="44" fill="#131519"/>' +
    fence + crop +
    /* пугало вдалеке */
    '<path d="M352 214 L352 176" stroke="#191b1f" stroke-width="4"/>' +
    '<path d="M336 186 L368 186" stroke="#191b1f" stroke-width="3"/>' +
    '<circle cx="352" cy="172" r="7" fill="#1c1e22"/>' +
    fog(232, '#3a3d44', 0.16) +
    '<rect width="400" height="260" fill="url(#vig)"/>';
}

/* ============================== ТЁМНЫЙ ЛЕС ============================== */
function forest() {
  let trees = '';
  const xs = [22, 68, 118, 168, 214, 262, 310, 356, 388];
  xs.forEach((x, i) => {
    const w = 8 + (i % 3) * 3, h = 150 + (i % 4) * 22, lean = (i % 2 ? 1 : -1) * 3;
    trees += '<path d="M' + x + ' 250 L' + (x + lean) + ' ' + (250 - h) + '" stroke="#0d0f0c" stroke-width="' + w + '" stroke-linecap="round"/>' +
      /* ветви */
      '<path d="M' + (x + lean) + ' ' + (250 - h * 0.62) + ' q-26 -10 -40 -26 M' + (x + lean) + ' ' + (250 - h * 0.75) +
      ' q26 -10 40 -26" stroke="#0d0f0c" stroke-width="' + (w * 0.55) + '" fill="none" stroke-linecap="round"/>' +
      '<path d="M' + (x + lean) + ' ' + (250 - h * 0.42) + ' q-22 -8 -34 -22" stroke="#0d0f0c" stroke-width="' + (w * 0.45) + '" fill="none" stroke-linecap="round"/>';
  });
  let under = '';
  for (let i = 0; i < 30; i++) {
    const x = rnd(0, 400), y = rnd(224, 250), h = rnd(12, 26);
    under += '<path d="M' + x.toFixed(1) + ' ' + y.toFixed(1) + ' q' + rnd(-6, 6).toFixed(1) + ' -' + (h * 0.5).toFixed(1) +
      ' ' + rnd(-9, 9).toFixed(1) + ' -' + h.toFixed(1) + '" stroke="#161a12" stroke-width="1.8" fill="none"/>';
  }
  return '<rect width="400" height="260" fill="url(#skForest)"/>' +
    stars(24, 90) +
    moon(60, 44, 18, '#c8ccc0') +
    /* дальний ряд деревьев */
    '<path d="M0 200 q24 -60 44 0 q22 -70 44 0 q24 -54 46 0 q22 -66 46 0 q24 -58 46 0 q22 -64 44 0 q24 -52 44 0 q22 -62 46 0 L400 260 L0 260Z" fill="#0a0c08" opacity=".9"/>' +
    trees +
    '<rect y="238" width="400" height="22" fill="#0f120c"/>' + under +
    /* светлячки */
    '<circle cx="96" cy="168" r="2" fill="#cfe08a" opacity=".7"><animate attributeName="cy" values="168;158;168" dur="6s" repeatCount="indefinite"/></circle>' +
    '<circle cx="286" cy="182" r="1.6" fill="#cfe08a" opacity=".6"><animate attributeName="cy" values="182;172;182" dur="7s" repeatCount="indefinite"/></circle>' +
    fog(236, '#2a3320', 0.18) +
    '<rect width="400" height="260" fill="url(#vig)"/>';
}

/* ============================== ПОДЗЕМЕЛЬЕ ============================== */
function dungeon() {
  let stal = '';
  for (let i = 0; i < 12; i++) {
    const x = rnd(0, 400), h = rnd(24, 70), w = rnd(9, 20);
    stal += '<path d="M' + x.toFixed(1) + ' 0 L' + (x - w / 2).toFixed(1) + ' ' + h.toFixed(1) + ' L' + (x + w / 2).toFixed(1) + ' ' + h.toFixed(1) + 'Z" fill="#101014"/>';
  }
  let stalUp = '';
  for (let i = 0; i < 10; i++) {
    const x = rnd(0, 400), h = rnd(20, 54), w = rnd(8, 18);
    stalUp += '<path d="M' + x.toFixed(1) + ' 260 L' + (x - w / 2).toFixed(1) + ' ' + (260 - h).toFixed(1) + ' L' + (x + w / 2).toFixed(1) + ' ' + (260 - h).toFixed(1) + 'Z" fill="#0c0c10"/>';
  }
  /* колонны */
  const cols = [40, 200, 360].map(x =>
    '<rect x="' + (x - 14) + '" y="86" width="28" height="150" fill="#121216"/>' +
    '<rect x="' + (x - 20) + '" y="80" width="40" height="12" fill="#16161c"/>' +
    '<rect x="' + (x - 20) + '" y="228" width="40" height="12" fill="#16161c"/>' +
    '<path d="M' + x + ' 96 v130" stroke="#0a0a0e" stroke-width="2" opacity=".6"/>').join('');
  let bones = '';
  for (let i = 0; i < 7; i++) {
    const x = rnd(30, 370), y = rnd(236, 252);
    bones += '<path d="M' + x.toFixed(1) + ' ' + y.toFixed(1) + ' l16 -4 M' + (x + 2).toFixed(1) + ' ' + (y + 5).toFixed(1) +
      ' l14 3" stroke="#3a3a40" stroke-width="2.4" stroke-linecap="round"/>';
  }
  return '<rect width="400" height="260" fill="url(#skDungeon)"/>' +
    stal +
    /* факелы */
    '<g><circle cx="120" cy="120" r="26" fill="#6a4a1c" opacity=".14"><animate attributeName="opacity" values=".14;.24;.14" dur="1.8s" repeatCount="indefinite"/></circle>' +
    '<circle cx="120" cy="120" r="7" fill="#c98a2c" opacity=".85"><animate attributeName="r" values="7;9;7" dur="1.6s" repeatCount="indefinite"/></circle></g>' +
    '<g><circle cx="300" cy="130" r="26" fill="#6a4a1c" opacity=".13"><animate attributeName="opacity" values=".13;.22;.13" dur="2.2s" repeatCount="indefinite"/></circle>' +
    '<circle cx="300" cy="130" r="7" fill="#c98a2c" opacity=".85"><animate attributeName="r" values="7;9;7" dur="1.9s" repeatCount="indefinite"/></circle></g>' +
    cols +
    '<rect y="232" width="400" height="28" fill="#0e0e12"/>' + bones +
    fog(240, '#2a2218', 0.16) +
    stalUp +
    '<rect width="400" height="260" fill="url(#vig)"/>';
}

/* ============================== МЁРТВЫЕ ГОРЫ ============================== */
function mountains() {
  let ridge = '';
  for (let i = 0; i < 5; i++) {
    const x = -40 + i * 110, w = 150 + (i % 2) * 40, h = 90 + (i % 3) * 30;
    ridge += '<path d="M' + x + ' 260 L' + (x + w / 2) + ' ' + (260 - h) + ' L' + (x + w) + ' 260Z" fill="#0e0f14"/>' +
      '<path d="M' + (x + w / 2) + ' ' + (260 - h) + ' l-18 34 l36 0Z" fill="#3a3d46" opacity=".55"/>';
  }
  let peaks = '';
  for (let i = 0; i < 4; i++) {
    const x = 20 + i * 120, w = 110, h = 60 + (i % 2) * 22;
    peaks += '<path d="M' + x + ' 260 L' + (x + w / 2) + ' ' + (260 - h) + ' L' + (x + w) + ' 260Z" fill="#08090c"/>';
  }
  let rocks = '';
  for (let i = 0; i < 9; i++) {
    const x = rnd(20, 380), y = rnd(236, 252), s = rnd(6, 16);
    rocks += '<path d="M' + x.toFixed(1) + ' ' + y.toFixed(1) + ' l' + (s * 0.6).toFixed(1) + ' -' + (s * 0.7).toFixed(1) +
      ' l' + (s * 0.7).toFixed(1) + ' ' + (s * 0.7).toFixed(1) + 'Z" fill="#14151a"/>';
  }
  return '<rect width="400" height="260" fill="url(#skMount)"/>' +
    stars(80, 140) + moon(96, 50, 22, '#e0e0dc') +
    ridge +
    /* тучи */
    '<ellipse cx="120" cy="90" rx="90" ry="16" fill="#1a1c24" opacity=".55"><animate attributeName="cx" values="120;150;120" dur="30s" repeatCount="indefinite"/></ellipse>' +
    '<ellipse cx="300" cy="70" rx="70" ry="13" fill="#171a22" opacity=".5"><animate attributeName="cx" values="300;270;300" dur="26s" repeatCount="indefinite"/></ellipse>' +
    peaks + rocks +
    /* падающий снег */
    '<circle cx="80" cy="120" r="1.4" fill="#cfd2d8" opacity=".5"><animate attributeName="cy" values="120;240" dur="9s" repeatCount="indefinite"/></circle>' +
    '<circle cx="200" cy="90" r="1.2" fill="#cfd2d8" opacity=".4"><animate attributeName="cy" values="90;240" dur="12s" repeatCount="indefinite"/></circle>' +
    '<circle cx="320" cy="140" r="1.4" fill="#cfd2d8" opacity=".45"><animate attributeName="cy" values="140;245" dur="10s" repeatCount="indefinite"/></circle>' +
    fog(240, '#2c2f38', 0.2) +
    '<rect width="400" height="260" fill="url(#vig)"/>';
}

/* ============================== ПРОКЛЯТЫЙ СОБОР ============================== */
function cathedral() {
  /* витраж */
  const winX = 200, winY = 96, winW = 54, winH = 84;
  const win = '<path d="M' + (winX - winW / 2) + ' ' + (winY + winH) + ' L' + (winX - winW / 2) + ' ' + winY +
    ' q' + (winW / 2) + ' -' + (winH * 0.5) + ' ' + winW + ' 0 L' + (winX + winW / 2) + ' ' + (winY + winH) + 'Z" fill="#3a3550" opacity=".85"/>' +
    '<path d="M' + winX + ' ' + (winY - 12) + ' v' + (winH + 12) + ' M' + (winX - winW / 2) + ' ' + (winY + 34) + ' h' + winW + '" stroke="#15121e" stroke-width="3"/>' +
    '<path d="M' + (winX - winW / 2) + ' ' + (winY + winH) + ' L' + (winX - winW / 2) + ' ' + winY + ' q' + (winW / 2) + ' -' + (winH * 0.5) + ' ' + winW + ' 0 L' + (winX + winW / 2) + ' ' + (winY + winH) + 'Z" fill="none" stroke="#0d0b14" stroke-width="3"/>' +
    '<circle cx="' + winX + '" cy="' + (winY + 18) + '" r="9" fill="#6a5a9a" opacity=".6"><animate attributeName="opacity" values=".6;.9;.6" dur="4s" repeatCount="indefinite"/></circle>';
  /* арки */
  const arch = (x, w, h) => '<path d="M' + x + ' 260 L' + x + ' ' + (260 - h + w / 2) + ' q' + (w / 2) + ' -' + (w / 2) +
    ' ' + w + ' 0 L' + (x + w) + ' 260Z" fill="#0b0a12"/>';
  /* свечи */
  let candles = '';
  for (let i = 0; i < 8; i++) {
    const x = 50 + i * 42, y = 226, h = rnd(10, 18);
    candles += '<rect x="' + x + '" y="' + (y - h) + '" width="5" height="' + h + '" fill="#3a3644"/>' +
      '<circle cx="' + (x + 2.5) + '" cy="' + (y - h - 4) + '" r="3.4" fill="#d8c07a" opacity=".9">' +
      '<animate attributeName="opacity" values=".9;.5;.9" dur="' + rnd(1.4, 2.6).toFixed(1) + 's" repeatCount="indefinite"/></circle>' +
      '<circle cx="' + (x + 2.5) + '" cy="' + (y - h - 4) + '" r="10" fill="#d8c07a" opacity=".12"/>';
  }
  return '<rect width="400" height="260" fill="url(#skCath)"/>' +
    /* колонны по бокам */
    arch(0, 90, 210) + arch(310, 90, 210) +
    '<rect x="0" y="60" width="26" height="200" fill="#0f0d18"/>' +
    '<rect x="374" y="60" width="26" height="200" fill="#0f0d18"/>' +
    '<rect x="84" y="70" width="20" height="190" fill="#0d0b14"/>' +
    '<rect x="296" y="70" width="20" height="190" fill="#0d0b14"/>' +
    win +
    /* алтарь */
    '<path d="M170 236 h60 v-16 h-60Z" fill="#15121e"/>' +
    '<path d="M182 220 h36 v-30 h-36Z" fill="#1a1626"/>' +
    candles +
    /* падающая пыль */
    '<circle cx="150" cy="60" r="1.2" fill="#cfc8e0" opacity=".4"><animate attributeName="cy" values="60;230" dur="14s" repeatCount="indefinite"/></circle>' +
    '<circle cx="250" cy="40" r="1" fill="#cfc8e0" opacity=".35"><animate attributeName="cy" values="40;230" dur="18s" repeatCount="indefinite"/></circle>' +
    fog(238, '#2e2840', 0.2) +
    '<rect width="400" height="260" fill="url(#vig)"/>';
}

/* ============================== БЕЗДНА ============================== */
function abyss() {
  /* разлом */
  const rift = '<path d="M200 0 L188 60 L206 120 L190 180 L204 260" stroke="#c0404a" stroke-width="3" fill="none" opacity=".55">' +
    '<animate attributeName="opacity" values=".55;.9;.55" dur="3.4s" repeatCount="indefinite"/></path>' +
    '<path d="M200 0 L188 60 L206 120 L190 180 L204 260" stroke="#ff6a72" stroke-width="1.4" fill="none" opacity=".8"/>' +
    '<path d="M200 0 L188 60 L206 120 L190 180 L204 260" stroke="#ff9aa0" stroke-width="10" fill="none" opacity=".1"/>';
  /* щупальца */
  let tent = '';
  for (let i = 0; i < 6; i++) {
    const x = rnd(20, 380), h = rnd(40, 90), w = rnd(10, 22);
    tent += '<path d="M' + x.toFixed(1) + ' 260 q' + rnd(-20, 20).toFixed(1) + ' -' + (h * 0.6).toFixed(1) + ' ' +
      rnd(-26, 26).toFixed(1) + ' -' + h.toFixed(1) + '" stroke="#150508" stroke-width="' + w.toFixed(1) + '" fill="none" stroke-linecap="round">' +
      '<animateTransform attributeName="transform" type="rotate" values="-4 ' + x.toFixed(1) + ' 260;4 ' + x.toFixed(1) + ' 260;-4 ' +
      x.toFixed(1) + ' 260" dur="' + rnd(4, 7).toFixed(1) + 's" repeatCount="indefinite"/></path>';
  }
  /* кости и черепа */
  let bones = '';
  for (let i = 0; i < 8; i++) {
    const x = rnd(20, 380), y = rnd(238, 254);
    bones += '<ellipse cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" rx="7" ry="5" fill="#2a2426"/>' +
      '<circle cx="' + (x - 2).toFixed(1) + '" cy="' + (y - 1).toFixed(1) + '" r="1.4" fill="#0a0406"/>' +
      '<circle cx="' + (x + 2).toFixed(1) + '" cy="' + (y - 1).toFixed(1) + '" r="1.4" fill="#0a0406"/>';
  }
  return '<rect width="400" height="260" fill="url(#skAbyss)"/>' +
    stars(40, 100) +
    moon(330, 48, 20, '#c05050') +
    /* скалы */
    '<path d="M0 260 L40 150 L80 260Z M320 260 L360 140 L400 260Z" fill="#0a0406"/>' +
    rift + tent +
    '<rect y="240" width="400" height="20" fill="#0c0406"/>' + bones +
    /* тлеющие угли */
    '<circle cx="120" cy="244" r="2.4" fill="#ff5a52" opacity=".7"><animate attributeName="cy" values="244;120;244" dur="7s" repeatCount="indefinite"/></circle>' +
    '<circle cx="280" cy="244" r="2" fill="#ff5a52" opacity=".6"><animate attributeName="cy" values="244;140;244" dur="9s" repeatCount="indefinite"/></circle>' +
    fog(242, '#3a1418', 0.22) +
    '<rect width="400" height="260" fill="url(#vig)"/>';
}

const MAP = { fields, forest, dungeon, mountains, cathedral, abyss };

/* отдать готовую сцену: общие defs + выбранный пейзаж */
function render(key) {
  const f = MAP[key] || fields;
  return '<defs>' +
    '<linearGradient id="skFields" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#07080b"/><stop offset="1" stop-color="#1b1f26"/></linearGradient>' +
    '<linearGradient id="skForest" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050604"/><stop offset="1" stop-color="#0e1409"/></linearGradient>' +
    '<linearGradient id="skDungeon" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#060607"/><stop offset="1" stop-color="#15100c"/></linearGradient>' +
    '<linearGradient id="skMount" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050508"/><stop offset="1" stop-color="#14141e"/></linearGradient>' +
    '<linearGradient id="skCath" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050410"/><stop offset="1" stop-color="#141024"/></linearGradient>' +
    '<linearGradient id="skAbyss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050203"/><stop offset="1" stop-color="#1a0508"/></linearGradient>' +
    '<radialGradient id="vig"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".75"/></radialGradient>' +
    '</defs>' + f();
}

return { render, keys: Object.keys(MAP) };
})();
