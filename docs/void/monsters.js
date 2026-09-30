/* =========================================================================
   МОНСТРЫ — детализированная векторная графика (SVG + SMIL).
   Каждое существо строится из слоёв: контур, градиентный объём, блики,
   анатомия (когти, клыки, рёбра, шипы, кости) и своя анимация.
   Палитра p приходит из локации: p.body, p.dark, p.eye, p.accent, p.light
   ========================================================================= */
window.MONSTERS = (function () {
'use strict';

let _uid = 0;
const nid = () => 'mg' + (++_uid);

/* Сборщик графики: накапливает <defs> и отдаёт url(#id) для заливок. */
function Art() {
  this.defs = '';
  /* вертикальный градиент — объём тела сверху вниз */
  this.v = (c1, c2) => {
    const id = nid();
    this.defs += '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient>';
    return 'url(#' + id + ')';
  };
  /* горизонтальный градиент — свет сбоку */
  this.h = (c1, c2) => {
    const id = nid();
    this.defs += '<linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient>';
    return 'url(#' + id + ')';
  };
  /* радиальное свечение — глаза, аура, магия */
  this.r = (c1, c2, o) => {
    const id = nid();
    this.defs += '<radialGradient id="' + id + '">' +
      '<stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '" stop-opacity="' + (o === undefined ? 0 : o) + '"/></radialGradient>';
    return 'url(#' + id + ')';
  };
}

/* ---------- анимация ---------- */
/* Амплитуды ограничены намеренно: кадр твари считается по статичной фигуре,
   и слишком большой размах (дрожание, взмах, дыхание) выносил бы её за
   границы кадра — тварь обрезалась бы по краю. */
const AMP_FLOAT = 3, AMP_SWING = 6, AMP_SHAKE = 2, AMP_BREATHE = 0.03;

const floatS = (inner, dur, dy) => '<g>' + inner +
  '<animateTransform attributeName="transform" type="translate" values="0 0;0 ' + (-Math.min(dy, AMP_FLOAT)) + ';0 0" dur="' + dur + 's" repeatCount="indefinite"/></g>';

const swingS = (inner, dur, deg, cx, cy) => {
  const d = Math.min(deg, AMP_SWING);
  return '<g>' +
  '<animateTransform attributeName="transform" type="rotate" values="' + (-d) + ' ' + cx + ' ' + cy + ';' +
  d + ' ' + cx + ' ' + cy + ';' + (-d) + ' ' + cx + ' ' + cy + '" dur="' + dur + 's" repeatCount="indefinite"/>' +
  inner + '</g>';
};

const breatheS = (inner, dur, cx, cy, k) => {
  const a = Math.min(k === undefined ? 1.03 : k, 1 + AMP_BREATHE), b = 2 - a;
  return '<g transform="translate(' + cx + ' ' + cy + ')"><g>' +
    '<animateTransform attributeName="transform" type="scale" values="1 1;' + a + ' ' + b + ';1 1" dur="' + dur + 's" repeatCount="indefinite"/>' +
    '<g transform="translate(' + (-cx) + ' ' + (-cy) + ')">' + inner + '</g></g></g>';
};

const shakeS = (inner, dur, dx) => {
  const d = Math.min(dx, AMP_SHAKE);
  return '<g>' +
  '<animateTransform attributeName="transform" type="translate" values="0 0;' + d + ' ' + (-d) + ';' + (-d) + ' ' + d + ';0 0" dur="' + dur + 's" repeatCount="indefinite"/>' +
  inner + '</g>';
};

const glowS = (inner, dur, a, b) => '<g><animate attributeName="opacity" values="' + a + ';' + b + ';' + a +
  '" dur="' + dur + 's" repeatCount="indefinite"/>' + inner + '</g>';

/* ---------- анатомия ---------- */
/* глаз: свечение, белок/зрачок, моргание */
function eyesS(list, color, r) {
  return list.map(([x, y]) =>
    '<g><circle cx="' + x + '" cy="' + y + '" r="' + (r * 2.6) + '" fill="' + color + '" opacity=".18">' +
      '<animate attributeName="opacity" values=".18;.05;.18" dur="2.6s" repeatCount="indefinite"/></circle>' +
    '<circle cx="' + x + '" cy="' + y + '" r="' + (r * 1.25) + '" fill="' + color + '" opacity=".55"/>' +
    '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + color + '">' +
      '<animate attributeName="r" values="' + r + ';' + (r * 1.2) + ';' + r + '" dur="2.6s" repeatCount="indefinite"/></circle>' +
    '<ellipse cx="' + x + '" cy="' + y + '" rx="' + r + '" ry="' + r + '" fill="#0a0810">' +
      '<animate attributeName="ry" values="' + r + ';' + (r * 0.15) + ';' + r + '" dur="5.2s" repeatCount="indefinite" begin="' + (x % 3) + 's"/></ellipse>' +
    '<circle cx="' + (x - r * 0.35) + '" cy="' + (y - r * 0.35) + '" r="' + (r * 0.3) + '" fill="#fff" opacity=".8"/></g>').join('');
}

/* ряд клыков: у каждого зуба тень у основания и светлый кончик */
function fangs(x, y, w, n, up, col) {
  let s = '';
  const base = col || '#e8e2d4';
  for (let i = 0; i < n; i++) {
    const fx = x + (i * w) / (n - 1);
    /* крайние зубы короче — пасть выглядит естественнее ровного ряда */
    const edge = 1 - Math.abs(i - (n - 1) / 2) / (n * 1.4);
    const h = (4.5 + (i % 2) * 2.5) * (0.7 + 0.5 * edge);
    const tipY = up ? -h : h;
    s += '<path d="M' + fx + ' ' + y + ' l3 ' + tipY + ' l3 ' + (-tipY) + 'Z" fill="' + base + '"/>' +
      '<path d="M' + fx + ' ' + y + ' l3 ' + tipY + ' l-1.4 ' + (-tipY * 0.35) + 'Z" fill="#0a0810" opacity=".22"/>';
  }
  return s;
}

/* когти на лапе: тёмное основание и светлый кончик — кератин, не штрих */
function claws(x, y, n, len, spread, col) {
  let s = '';
  const tip = col || '#cfc8b6';
  for (let i = 0; i < n; i++) {
    const a = (-spread / 2 + (spread * i) / Math.max(1, n - 1)) * Math.PI / 180;
    const L = len * (0.82 + 0.18 * Math.sin((i / Math.max(1, n - 1)) * Math.PI));
    const dx = Math.sin(a) * L, dy = Math.cos(a) * L;
    s += '<path d="M' + x + ' ' + y + ' q' + (dx * 0.4) + ' ' + (dy * 0.6) + ' ' + dx + ' ' + dy + '" stroke="#0a0810" stroke-width="3.4" fill="none" stroke-linecap="round" opacity=".45"/>' +
      '<path d="M' + x + ' ' + y + ' q' + (dx * 0.4) + ' ' + (dy * 0.6) + ' ' + dx + ' ' + dy + '" stroke="' + tip +
      '" stroke-width="2.2" fill="none" stroke-linecap="round"/>';
  }
  return s;
}

/* позвоночник из позвонков: тело позвонка плюс поперечные отростки */
function spine(x, y1, y2, n, col, r) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const y = y1 + ((y2 - y1) * i) / Math.max(1, n - 1);
    /* позвонок чуть крупнее к середине хребта — так он читается как живой */
    const k = 1 - Math.abs(i - (n - 1) / 2) / (n * 1.8);
    const rr = Math.max(2.4, (r || 4) * k);
    s += '<path d="M' + (x - 6.5) + ' ' + y + ' l13 0" stroke="' + col + '" stroke-width="2.2" stroke-linecap="round"/>' +
      '<path d="M' + (x - 4) + ' ' + (y - 3.4) + ' l8 0 M' + (x - 4) + ' ' + (y + 3.4) + ' l8 0" stroke="' + col +
      '" stroke-width="1.4" opacity=".65"/>' +
      '<circle cx="' + x + '" cy="' + y + '" r="' + rr + '" fill="' + col + '"/>';
  }
  return s;
}

/* рёбра: пара дуг от хребта к грудине, книзу клетка сужается */
function ribs(x, y, n, w, col) {
  let s = '';
  /* грудина — кость по центру, к ней сходятся рёбра */
  s += '<path d="M' + x + ' ' + (y - 1) + ' L' + x + ' ' + (y + (n - 1) * 9 + 6) + '" stroke="' + col +
    '" stroke-width="3.2" stroke-linecap="round" opacity=".9"/>';
  for (let i = 0; i < n; i++) {
    const ry = y + i * 9;
    const ww = Math.max(6, w - i * 1.6);
    const drop = 6 + i * 1.8;
    s += '<path d="M' + x + ' ' + ry + ' q-' + ww + ' ' + (drop * 0.3) + ' -' + (ww + 3) + ' ' + drop + '" stroke="' + col +
      '" stroke-width="3.2" fill="none" stroke-linecap="round"/>' +
      '<path d="M' + x + ' ' + ry + ' q' + ww + ' ' + (drop * 0.3) + ' ' + (ww + 3) + ' ' + drop + '" stroke="' + col +
      '" stroke-width="3.2" fill="none" stroke-linecap="round"/>';
  }
  return s;
}

/* шипы вдоль хребта */
function spikes(x1, y1, x2, y2, n, h, col) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    const px = x1 + (x2 - x1) * t, py = y1 + (y2 - y1) * t;
    const hh = h * (0.6 + 0.4 * Math.sin(t * Math.PI));
    s += '<path d="M' + px + ' ' + py + ' l-' + (hh * 0.5) + ' ' + (-hh) + ' l' + hh + ' ' + (hh * 0.3) + 'Z" fill="' + col + '"/>';
  }
  return s;
}

/* тень под существом */
const shadowS = (rx, ry) => '<ellipse cx="100" cy="184" rx="' + (rx || 54) + '" ry="' + (ry || 10) + '" fill="#000" opacity=".5">' +
  '<animate attributeName="rx" values="' + (rx || 54) + ';' + ((rx || 54) * 0.86) + ';' + (rx || 54) + '" dur="3s" repeatCount="indefinite"/></ellipse>';

/* трещины/потёртости на поверхности */
function cracks(segs, col) {
  return segs.map(d => '<path d="' + d + '" stroke="' + (col || '#000') + '" stroke-width="1.6" fill="none" opacity=".38"/>').join('');
}

const list = [];
const add = (k, n, fn) => list.push({ k, n, fn });

/* ================================ МЕЛКИЕ ТВАРИ ================================ */
add('mouse', 'Чумная Мышь', p => {
  const a = new Art();
  const fur = a.v(p.light || p.body, p.dark), belly = a.v(p.body, p.dark);
  return { defs: a.defs, body: shadowS(50, 8) + floatS(
    swingS('<path d="M138 150 q48 4 54 -34" stroke="' + p.body + '" stroke-width="5.5" fill="none" stroke-linecap="round"/>' +
      '<path d="M138 150 q48 4 54 -34" stroke="' + p.accent + '" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".5"/>', 2.1, 13, 138, 150) +
    /* задние лапы */
    '<path d="M124 168 q10 8 20 4" stroke="' + p.dark + '" stroke-width="5" fill="none" stroke-linecap="round"/>' +
    claws(144, 172, 3, 7, 46, p.accent) +
    /* тело */
    '<ellipse cx="104" cy="148" rx="39" ry="27" fill="' + fur + '"/>' +
    '<ellipse cx="104" cy="156" rx="34" ry="17" fill="' + belly + '" opacity=".55"/>' +
    '<path d="M70 140 q34 -12 68 0" stroke="' + (p.light || p.body) + '" stroke-width="2" fill="none" opacity=".35"/>' +
    /* ухо */
    '<circle cx="82" cy="120" r="21" fill="' + fur + '"/>' +
    '<circle cx="82" cy="120" r="12" fill="' + p.dark + '" opacity=".6"/>' +
    '<circle cx="84" cy="118" r="5" fill="' + p.accent + '" opacity=".5"/>' +
    /* голова */
    '<ellipse cx="66" cy="152" rx="28" ry="23" fill="' + fur + '"/>' +
    '<path d="M44 138 q-10 -8 -14 -18 q10 4 16 12Z" fill="' + p.body + '"/>' +
    eyesS([[56, 148], [78, 148]], p.eye, 3.6) +
    /* нос и усы */
    '<circle cx="42" cy="162" r="3.6" fill="' + p.accent + '"/>' +
    '<path d="M40 156 l-18 3 M40 166 l-18 7 M40 172 l-16 9" stroke="' + p.accent + '" stroke-width="1.3" opacity=".55"/>' +
    /* зубы */
    fangs(50, 168, 12, 3, false, '#e8e2d4') +
    cracks(['M96 132 l6 8 l-3 7', 'M118 136 l5 6'], p.dark), 3.2, 4) };
});

add('bat', 'Ночной Кровосос', p => {
  const a = new Art();
  const wing = a.v(p.dark, '#000'), skin = a.v(p.body, p.dark);
  return { defs: a.defs, body: shadowS(46, 8) + floatS(
    swingS('<path d="M100 96 Q56 56 12 82 Q40 90 36 116 Q68 102 98 118Z" fill="' + wing + '"/>' +
      '<path d="M100 96 Q68 70 40 84 M100 100 Q72 80 48 92 M100 106 Q78 92 58 100" stroke="' + p.accent + '" stroke-width="1.5" fill="none" opacity=".4"/>' +
      '<path d="M14 82 q10 14 22 16 M22 88 q10 12 20 14" stroke="' + p.dark + '" stroke-width="2" fill="none" opacity=".7"/>', 0.72, 16, 100, 100) +
    swingS('<path d="M100 96 Q144 56 188 82 Q160 90 164 116 Q132 102 102 118Z" fill="' + wing + '"/>' +
      '<path d="M100 96 Q132 70 160 84 M100 100 Q128 80 152 92 M100 106 Q122 92 142 100" stroke="' + p.accent + '" stroke-width="1.5" fill="none" opacity=".4"/>' +
      '<path d="M186 82 q-10 14 -22 16 M178 88 q-10 12 -20 14" stroke="' + p.dark + '" stroke-width="2" fill="none" opacity=".7"/>', 0.72, -16, 100, 100) +
    /* тело */
    '<ellipse cx="100" cy="112" rx="19" ry="26" fill="' + skin + '"/>' +
    '<ellipse cx="100" cy="118" rx="13" ry="16" fill="' + p.dark + '" opacity=".5"/>' +
    /* уши */
    '<path d="M90 92 L78 60 L100 84 Z" fill="' + skin + '"/>' +
    '<path d="M110 92 L122 60 L100 84 Z" fill="' + skin + '"/>' +
    '<path d="M91 88 L84 68 L97 83Z M109 88 L116 68 L103 83Z" fill="' + p.accent + '" opacity=".35"/>' +
    /* лапы с когтями */
    '<path d="M86 134 q-8 12 -12 20 M114 134 q8 12 12 20" stroke="' + p.dark + '" stroke-width="4" fill="none" stroke-linecap="round"/>' +
    claws(74, 154, 3, 8, 40, p.accent) + claws(126, 154, 3, 8, 40, p.accent) +
    eyesS([[93, 106], [107, 106]], p.eye, 3.4) +
    /* клыки */
    fangs(92, 122, 16, 4, false, '#f0eadc') +
    '<path d="M92 122 h16" stroke="#0a0810" stroke-width="2"/>', 1.7, 9) };
});

add('spider', 'Могильный Паук', p => {
  const a = new Art();
  const abd = a.v(p.light || p.body, p.dark), leg = a.h(p.dark, '#000');
  const legPair = (x1, y1, cx, cy, x2, y2, ph) =>
    swingS('<path d="M' + x1 + ' ' + y1 + ' Q' + cx + ' ' + cy + ' ' + x2 + ' ' + y2 + '" stroke="' + leg +
      '" stroke-width="6.5" fill="none" stroke-linecap="round"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="3.4" fill="' + p.body + '"/>' +
      '<path d="M' + x2 + ' ' + y2 + ' l-3 8 M' + x2 + ' ' + y2 + ' l4 7" stroke="' + p.accent + '" stroke-width="1.8" fill="none"/>', 1.9, 11, x1, y1);
  return { defs: a.defs, body: shadowS(56, 9) + floatS(
    legPair(78, 116, 46, 92, 28, 116) + legPair(80, 130, 44, 124, 24, 150) +
    legPair(84, 144, 54, 156, 44, 182) + legPair(122, 116, 154, 92, 172, 116) +
    legPair(120, 130, 156, 124, 176, 150) + legPair(116, 144, 146, 156, 156, 182) +
    /* брюшко */
    '<ellipse cx="100" cy="140" rx="31" ry="27" fill="' + abd + '"/>' +
    '<ellipse cx="100" cy="146" rx="22" ry="16" fill="' + p.dark + '" opacity=".45"/>' +
    /* узор на брюшке */
    '<path d="M100 122 l-10 16 l10 14 l10 -14Z" fill="' + p.accent + '" opacity=".4"/>' +
    '<circle cx="100" cy="138" r="4" fill="' + p.accent + '" opacity=".6"/>' +
    /* головогрудь */
    '<ellipse cx="100" cy="112" rx="21" ry="19" fill="' + a.v(p.body, p.dark) + '"/>' +
    /* хелицеры */
    '<path d="M92 128 q-3 10 2 16 M108 128 q3 10 -2 16" stroke="' + p.dark + '" stroke-width="3.4" fill="none" stroke-linecap="round"/>' +
    fangs(94, 144, 12, 2, false, p.accent) +
    eyesS([[91, 108], [109, 108], [97, 118], [103, 118]], p.eye, 3) +
    spikes(88, 96, 112, 96, 4, 10, p.dark), 3.4, 5) };
});

add('slime', 'Пожирающая Слизь', p => {
  const a = new Art();
  /* Слизь — не студень-шар, а желе: обвисает каплей, дрожит, просвечивает.
     Объём даём двумя градиентами (тело и внутренняя тень), сверху кладём
     резкий блик — он и читается как мокрая плёнка. */
  const jelly = a.v(p.light || p.body, p.dark);
  const wet = a.h(p.light || p.body, p.body);
  const core = a.r(p.eye, p.dark);
  return { defs: a.defs, body: shadowS(54, 9) + shakeS(
    /* тело каплей: узкая макушка, тяжёлое дно с двумя языками */
    '<path d="M100 66 Q128 74 142 108 Q160 150 152 166 Q146 178 124 180 Q106 186 92 180 Q66 176 54 160 Q42 142 58 108 Q74 76 100 66Z" fill="' + jelly + '" opacity=".9"/>' +
    /* внутренний тёмный слой — глубина, видно, что желе прозрачное */
    '<path d="M100 84 Q122 92 132 118 Q144 150 136 162 Q128 172 110 174 Q92 172 84 160 Q74 142 84 116 Q92 92 100 84Z" fill="' + p.dark + '" opacity=".35"/>' +
    /* мокрая плёнка: яркая кромка слева и резкий блик */
    '<path d="M62 128 Q70 96 96 84" stroke="' + wet + '" stroke-width="3.4" fill="none" opacity=".55" stroke-linecap="round"/>' +
    '<ellipse cx="80" cy="108" rx="13" ry="7" fill="#fff" opacity=".26" transform="rotate(-28 80 108)"/>' +
    '<ellipse cx="118" cy="150" rx="7" ry="4" fill="#fff" opacity=".14"/>' +
    /* ядро-комок внутри */
    '<circle cx="100" cy="146" r="19" fill="' + core + '" opacity=".5">' +
    '<animate attributeName="r" values="19;23;19" dur="2.8s" repeatCount="indefinite"/></circle>' +
    '<circle cx="100" cy="146" r="8" fill="' + p.eye + '" opacity=".55"/>' +
    /* пузырьки всплывают и лопаются */
    '<circle cx="86" cy="128" r="5" fill="#fff" opacity=".2">' +
    '<animate attributeName="cy" values="140;104;140" dur="3.6s" repeatCount="indefinite"/></circle>' +
    '<circle cx="116" cy="136" r="3.4" fill="#fff" opacity=".18">' +
    '<animate attributeName="cy" values="148;112;148" dur="4.4s" repeatCount="indefinite"/></circle>' +
    '<circle cx="104" cy="120" r="2.4" fill="#fff" opacity=".16">' +
    '<animate attributeName="cy" values="132;100;132" dur="3s" repeatCount="indefinite"/></circle>' +
    /* желе подтекает: языки у основания */
    '<path d="M58 158 q-10 10 -6 20 q8 -4 12 -12" fill="' + jelly + '" opacity=".7"/>' +
    '<path d="M142 156 q10 10 6 20 q-8 -4 -12 -12" fill="' + jelly + '" opacity=".6"/>' +
    /* капли стекают по бокам */
    '<path d="M74 96 q-8 -16 -18 -22 q2 14 8 22" fill="' + jelly + '" opacity=".55"/>' +
    /* глаз, зрачок дрожит вместе с желе */
    eyesS([[86, 124], [114, 124]], p.eye, 4.2) +
    /* желе рот не имеет — только вмятина */
    '<path d="M86 156 q14 8 28 0" stroke="' + p.dark + '" stroke-width="2.4" fill="none" opacity=".45"/>', 2.4, 2) };
});

/* ================================ ЗВЕРИ И НЕЖИТЬ ================================ */
add('wolf', 'Лютый Волк', p => {
  const a = new Art();
  const fur = a.v(p.light || p.body, p.dark), muz = a.v(p.body, p.dark);
  return { defs: a.defs, body: shadowS(56, 10) + floatS(
    /* хвост */
    swingS('<path d="M58 124 q-26 -12 -30 -34 q14 6 22 18" fill="' + p.dark + '"/>' +
      '<path d="M58 124 q-24 -14 -28 -32" stroke="' + (p.light || p.body) + '" stroke-width="1.6" fill="none" opacity=".3"/>', 2.6, 14, 60, 126) +
    /* корпус */
    '<ellipse cx="100" cy="128" rx="45" ry="25" fill="' + fur + '"/>' +
    '<path d="M62 138 q38 12 78 0" stroke="' + p.dark + '" stroke-width="2" fill="none" opacity=".4"/>' +
    /* лапы */
    '<path d="M74 148 q-4 18 2 28 M126 148 q4 18 -2 28" stroke="' + p.dark + '" stroke-width="8" fill="none" stroke-linecap="round"/>' +
    claws(76, 178, 4, 9, 50, '#cfc8b6') + claws(124, 178, 4, 9, 50, '#cfc8b6') +
    /* шея */
    '<path d="M66 120 L100 84 L136 120 Z" fill="' + fur + '"/>' +
    /* голова */
    '<circle cx="100" cy="90" r="28" fill="' + fur + '"/>' +
    '<path d="M100 62 q-16 2 -22 14 q12 -6 22 -6 q10 0 22 6 q-6 -12 -22 -14Z" fill="' + (p.light || p.body) + '" opacity=".4"/>' +
    /* уши */
    '<path d="M79 70 L68 34 L96 62 Z" fill="' + fur + '"/>' +
    '<path d="M121 70 L132 34 L104 62 Z" fill="' + fur + '"/>' +
    '<path d="M80 66 L73 42 L91 60Z M120 66 L127 42 L109 60Z" fill="' + p.accent + '" opacity=".4"/>' +
    /* морда */
    '<ellipse cx="100" cy="106" rx="16" ry="14" fill="' + muz + '"/>' +
    '<ellipse cx="100" cy="100" rx="6" ry="5" fill="' + p.dark + '"/>' +
    /* пасть с клыками */
    '<path d="M88 112 q12 8 24 0" stroke="#0a0810" stroke-width="3" fill="none"/>' +
    fangs(88, 112, 24, 5, false, '#f0eadc') +
    '<path d="M86 106 q-4 -8 -2 -14 M114 106 q4 -8 2 -14" stroke="' + p.accent + '" stroke-width="2" fill="none" opacity=".6"/>' +
    eyesS([[88, 84], [112, 84]], p.eye, 4.2) +
    /* шерсть на загривке */
    spikes(74, 108, 126, 108, 6, 9, p.dark), 3, 5) };
});

add('skeleton', 'Восставший Скелет', p => {
  const a = new Art();
  /* кость объёмная: светлый гребень сверху, тень снизу, плюс отдельный
     градиент для суставов — иначе скелет читается как белая схема */
  const bone = a.v(p.light || p.body, p.dark);
  const joint = a.v(p.body, p.dark);
  const shine = p.light || p.body;
  return { defs: a.defs, body: shadowS(44, 9) + floatS(
    /* лопатки за рёбрами — каркас перестаёт быть плоским */
    '<path d="M78 98 q-10 8 -8 18 q10 4 16 -4Z" fill="' + joint + '"/>' +
    '<path d="M122 98 q10 8 8 18 q-10 4 -16 -4Z" fill="' + joint + '"/>' +
    /* ключицы */
    '<path d="M74 100 q26 -8 52 0" stroke="' + bone + '" stroke-width="4" fill="none" stroke-linecap="round"/>' +
    /* ноги: бедро, колено, голень, ступня */
    '<path d="M92 158 q-7 14 -9 22" stroke="' + bone + '" stroke-width="7" fill="none" stroke-linecap="round"/>' +
    '<path d="M108 158 q7 14 9 22" stroke="' + bone + '" stroke-width="7" fill="none" stroke-linecap="round"/>' +
    '<circle cx="83" cy="180" r="5.4" fill="' + joint + '"/>' +
    '<circle cx="117" cy="180" r="5.4" fill="' + joint + '"/>' +
    '<path d="M78 182 h22 M100 182 h22" stroke="' + p.dark + '" stroke-width="5" stroke-linecap="round"/>' +
    /* позвоночник */
    spine(100, 98, 156, 7, bone, 4.4) +
    /* рёбра с грудиной */
    ribs(100, 104, 4, 20, bone) +
    /* таз */
    '<path d="M84 152 q16 12 32 0 q-4 12 -16 12 q-12 0 -16 -12Z" fill="' + bone + '"/>' +
    '<path d="M88 156 q12 8 24 0" stroke="' + p.dark + '" stroke-width="1.6" fill="none" opacity=".5"/>' +
    /* руки: плечо, локоть, предплечье, кисть */
    swingS('<path d="M72 102 q-18 14 -22 34" stroke="' + bone + '" stroke-width="5.5" fill="none" stroke-linecap="round"/>' +
      '<circle cx="72" cy="102" r="5" fill="' + joint + '"/>' +
      '<circle cx="51" cy="135" r="4.4" fill="' + joint + '"/>' +
      /* кисть с фалангами, а не просто пучок когтей */
      '<path d="M51 136 q-6 4 -9 9 M51 136 q-2 6 -3 11 M51 136 q2 6 3 11" stroke="' + bone + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
      claws(46, 148, 3, 7, 44, '#cfc8b6'), 2.4, 12, 72, 102) +
    swingS('<path d="M128 102 q18 14 22 34" stroke="' + bone + '" stroke-width="5.5" fill="none" stroke-linecap="round"/>' +
      '<circle cx="128" cy="102" r="5" fill="' + joint + '"/>' +
      '<circle cx="149" cy="135" r="4.4" fill="' + joint + '"/>' +
      '<path d="M149 136 q6 4 9 9 M149 136 q2 6 3 11 M149 136 q-2 6 -3 11" stroke="' + bone + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
      claws(154, 148, 3, 7, 44, '#cfc8b6'), 2.4, -12, 128, 102) +
    /* череп */
    '<path d="M74 44 q26 -20 52 0 q13 13 4 30 q-9 13 -30 13 q-21 0 -30 -13 q-9 -17 4 -30Z" fill="' + bone + '"/>' +
    /* скулы и надбровные дуги — череп получает рельеф */
    '<path d="M80 56 q10 -5 18 0 M102 56 q10 -5 18 0" stroke="' + shine + '" stroke-width="2.2" fill="none" opacity=".5"/>' +
    '<path d="M76 76 q6 8 14 9 M124 76 q-6 8 -14 9" stroke="' + p.dark + '" stroke-width="1.8" fill="none" opacity=".45"/>' +
    /* глазницы */
    '<ellipse cx="88" cy="62" rx="9" ry="11" fill="#08060a"/>' +
    '<ellipse cx="112" cy="62" rx="9" ry="11" fill="#08060a"/>' +
    '<path d="M80 54 q8 -4 16 -1 M104 53 q8 -3 16 1" stroke="' + shine + '" stroke-width="1.6" fill="none" opacity=".35"/>' +
    eyesS([[88, 62], [112, 62]], p.eye, 3.4) +
    /* нос и челюсть с зубами */
    '<path d="M96 74 l4 8 l-8 0Z" fill="#0a0810"/>' +
    '<path d="M84 88 q16 10 32 0" stroke="#0a0810" stroke-width="2.4" fill="none"/>' +
    fangs(86, 88, 28, 6, false, bone) +
    /* трещины на черепе */
    cracks(['M84 40 l4 8 l-3 6', 'M116 42 l-4 7'], p.dark), 3.6, 6) };
});

add('scarecrow', 'Пугало Жатвы', p => {
  const a = new Art();
  const cloth = a.v(p.body, p.dark), sack = a.v(p.light || p.body, p.dark);
  return { defs: a.defs, body: shadowS(48, 9) + floatS(
    /* столб */
    '<path d="M100 82 L100 164" stroke="' + p.dark + '" stroke-width="7"/>' +
    '<path d="M100 82 L100 164" stroke="' + (p.light || p.body) + '" stroke-width="2" opacity=".25"/>' +
    /* перекладина */
    '<path d="M54 104 L146 104" stroke="' + p.dark + '" stroke-width="6"/>' +
    /* солома из рукавов */
    swingS('<path d="M60 104 q-10 20 -16 32" stroke="' + p.dark + '" stroke-width="5" fill="none" stroke-linecap="round"/>' +
      '<path d="M54 132 l-12 10 M58 136 l-10 14 M62 138 l-6 16" stroke="' + p.accent + '" stroke-width="2" fill="none"/>', 3, 13, 60, 104) +
    swingS('<path d="M140 104 q10 20 16 32" stroke="' + p.dark + '" stroke-width="5" fill="none" stroke-linecap="round"/>' +
      '<path d="M146 132 l12 10 M142 136 l10 14 M138 138 l6 16" stroke="' + p.accent + '" stroke-width="2" fill="none"/>', 3, -13, 140, 104) +
    /* рубаха */
    '<path d="M72 64 q28 -16 56 0 l7 38 q-35 14 -70 0 Z" fill="' + cloth + '"/>' +
    '<path d="M78 74 q22 8 44 0 M76 90 q24 8 48 0" stroke="' + p.dark + '" stroke-width="1.8" fill="none" opacity=".5"/>' +
    /* заплаты */
    '<path d="M84 84 l10 -3 l4 10 l-10 4Z" fill="' + p.dark + '" opacity=".5"/>' +
    '<path d="M112 92 l8 2 l-2 9 l-8 -2Z" fill="' + p.dark + '" opacity=".4"/>' +
    /* шляпа */
    '<path d="M70 70 L54 32 L96 54 Z M130 70 L146 32 L104 54 Z" fill="' + p.dark + '"/>' +
    '<path d="M74 68 L62 40 L92 56Z M126 68 L138 40 L108 56Z" fill="' + p.accent + '" opacity=".25"/>' +
    /* голова-мешок */
    '<ellipse cx="100" cy="78" rx="27" ry="23" fill="' + sack + '"/>' +
    '<path d="M78 70 q22 -10 44 0" stroke="' + p.dark + '" stroke-width="1.8" fill="none" opacity=".4"/>' +
    /* крестики-глаза */
    '<path d="M86 72 l10 10 M96 72 l-10 10" stroke="#0a0810" stroke-width="3.4" stroke-linecap="round"/>' +
    '<path d="M104 72 l10 10 M114 72 l-10 10" stroke="#0a0810" stroke-width="3.4" stroke-linecap="round"/>' +
    eyesS([[91, 77], [109, 77]], p.eye, 3) +
    /* рот */
    '<path d="M84 90 q16 12 32 0" stroke="#0a0810" stroke-width="2.6" fill="none"/>' +
    fangs(88, 92, 24, 5, false, '#e8e2d4') +
    /* ворон */
    '<path d="M52 44 q10 -6 16 2 q-8 6 -16 -2Z" fill="#0d0b12"/>' +
    '<circle cx="55" cy="42" r="1.6" fill="' + p.eye + '"/>', 4, 5) };
});

add('rat', 'Крыса-Падальщик', p => {
  const a = new Art();
  const fur = a.v(p.light || p.body, p.dark), skin = a.v(p.body, p.dark);
  return { defs: a.defs, body: shadowS(52, 9) + floatS(
    /* хвост */
    swingS('<path d="M142 150 q50 4 58 -36" stroke="' + p.body + '" stroke-width="6" fill="none" stroke-linecap="round"/>' +
      '<path d="M142 150 q50 4 58 -36" stroke="' + p.accent + '" stroke-width="1.4" fill="none" opacity=".4"/>', 2, 15, 142, 150) +
    /* тело */
    '<ellipse cx="102" cy="146" rx="42" ry="26" fill="' + fur + '"/>' +
    '<ellipse cx="102" cy="154" rx="36" ry="18" fill="' + skin + '" opacity=".5"/>' +
    /* грязная шерсть */
    spikes(78, 132, 126, 130, 7, 7, p.dark) +
    /* лапы */
    '<path d="M84 164 q-2 14 2 18 M120 164 q2 14 -2 18" stroke="' + p.dark + '" stroke-width="6" fill="none" stroke-linecap="round"/>' +
    claws(86, 182, 4, 8, 50, p.accent) + claws(118, 182, 4, 8, 50, p.accent) +
    /* ухо */
    '<circle cx="78" cy="126" r="18" fill="' + p.dark + '" opacity=".75"/>' +
    '<circle cx="78" cy="126" r="10" fill="' + p.accent + '" opacity=".35"/>' +
    /* голова */
    '<ellipse cx="62" cy="152" rx="29" ry="24" fill="' + fur + '"/>' +
    '<path d="M46 138 q-8 -10 -10 -20 q10 6 14 14Z" fill="' + p.body + '"/>' +
    eyesS([[52, 146], [76, 148]], p.eye, 3.5) +
    /* нос, усы */
    '<ellipse cx="36" cy="162" rx="4" ry="3.4" fill="' + p.accent + '"/>' +
    '<path d="M34 156 l-20 4 M34 166 l-20 8 M36 172 l-18 10" stroke="' + p.accent + '" stroke-width="1.2" opacity=".5"/>' +
    /* резцы */
    '<path d="M42 170 l3 9 l3 -9 M50 170 l3 9 l3 -9" stroke="#e8e2d4" stroke-width="2.4" fill="none"/>' +
    cracks(['M92 130 l6 7 l-2 6', 'M112 132 l4 8'], p.dark), 3.4, 4) };
});

add('golem', 'Камнерождённый', p => {
  const a = new Art();
  const rock = a.v(p.body, p.dark), rock2 = a.v(p.light || p.body, p.dark), core = a.r(p.eye, p.dark);
  return { defs: a.defs, body: shadowS(58, 10) + floatS(
    /* ноги */
    '<rect x="76" y="150" width="20" height="30" rx="5" fill="' + rock + '"/>' +
    '<rect x="104" y="150" width="20" height="30" rx="5" fill="' + rock + '"/>' +
    '<rect x="72" y="172" width="28" height="12" rx="4" fill="' + p.dark + '"/>' +
    '<rect x="100" y="172" width="28" height="12" rx="4" fill="' + p.dark + '"/>' +
    /* корпус — из отдельных глыб */
    '<rect x="64" y="86" width="72" height="70" rx="11" fill="' + rock + '"/>' +
    '<path d="M64 110 h72 M64 132 h72" stroke="' + p.dark + '" stroke-width="2.4" opacity=".55"/>' +
    '<path d="M82 86 v70 M100 86 v70 M118 86 v70" stroke="' + p.dark + '" stroke-width="2" opacity=".4"/>' +
    /* плечи */
    '<rect x="52" y="88" width="20" height="16" rx="5" fill="' + rock2 + '"/>' +
    '<rect x="128" y="88" width="20" height="16" rx="5" fill="' + rock2 + '"/>' +
    /* руки */
    swingS('<rect x="30" y="98" width="26" height="56" rx="10" fill="' + rock + '"/>' +
      '<rect x="32" y="104" width="22" height="20" rx="6" fill="' + rock2 + '" opacity=".6"/>' +
      '<path d="M34 150 l-4 10 M44 152 l0 12 M54 150 l4 10" stroke="' + p.dark + '" stroke-width="4" stroke-linecap="round"/>', 3.2, 7, 58, 104) +
    swingS('<rect x="144" y="98" width="26" height="56" rx="10" fill="' + rock + '"/>' +
      '<rect x="146" y="104" width="22" height="20" rx="6" fill="' + rock2 + '" opacity=".6"/>' +
      '<path d="M146 150 l-4 10 M156 152 l0 12 M166 150 l4 10" stroke="' + p.dark + '" stroke-width="4" stroke-linecap="round"/>', 3.2, -7, 142, 104) +
    /* голова */
    '<rect x="74" y="40" width="52" height="48" rx="10" fill="' + rock + '"/>' +
    '<rect x="78" y="44" width="44" height="14" rx="5" fill="' + rock2 + '" opacity=".5"/>' +
    cracks(['M80 46 l8 12 l-4 10', 'M122 48 l-8 10 l4 12', 'M96 74 l6 8'], '#000') +
    /* нависающая каменная бровь и тяжёлая челюсть */
    '<path d="M78 56 h44" stroke="' + p.dark + '" stroke-width="4" stroke-linecap="round" opacity=".6"/>' +
    '<path d="M84 80 q16 8 32 0" stroke="' + p.dark + '" stroke-width="3.4" fill="none" opacity=".5"/>' +
    eyesS([[88, 64], [112, 64]], p.eye, 3.8) +
    /* раскалённое сердце: жила уходит вниз по корпусу */
    '<circle cx="100" cy="120" r="11" fill="' + core + '">' +
    '<animate attributeName="opacity" values=".55;1;.55" dur="2.8s" repeatCount="indefinite"/></circle>' +
    '<path d="M100 112 l4 8 l-4 10 l-4 -10Z" fill="#fff" opacity=".35"/>' +
    '<path d="M100 132 q-4 14 -2 24 M100 132 q4 14 2 24" stroke="' + p.eye + '" stroke-width="1.8" fill="none" opacity=".4"/>' +
    /* швы между глыбами корпуса */
    '<path d="M70 98 q10 6 20 2 M130 98 q-10 6 -20 2 M70 122 q10 6 20 2 M130 122 q-10 6 -20 2" stroke="' + p.dark +
    '" stroke-width="1.8" fill="none" opacity=".45"/>' +
    /* осыпающаяся крошка у ног */
    '<circle cx="70" cy="186" r="2" fill="' + p.dark + '" opacity=".5"/><circle cx="132" cy="184" r="1.6" fill="' + p.dark + '" opacity=".45"/>' +
    '<circle cx="80" cy="190" r="1.4" fill="' + p.dark + '" opacity=".4"/>', 4.2, 4) };
});

add('gargoyle', 'Горгулья', p => {
  const a = new Art();
  const stone = a.v(p.light || p.body, p.dark), wing = a.v(p.dark, '#000');
  return { defs: a.defs, body: shadowS(56, 10) + floatS(
    /* крылья с перепонками */
    swingS('<path d="M100 96 Q58 60 20 82 Q46 90 42 116 Q72 102 98 118Z" fill="' + wing + '"/>' +
      '<path d="M100 96 Q70 68 44 84 M100 102 Q74 82 52 94" stroke="' + p.accent + '" stroke-width="1.6" fill="none" opacity=".4"/>' +
      '<path d="M22 82 q8 12 18 16 M30 88 q8 10 16 14" stroke="' + p.dark + '" stroke-width="2" fill="none" opacity=".7"/>', 2.4, 13, 100, 96) +
    swingS('<path d="M100 96 Q142 60 180 82 Q154 90 158 116 Q128 102 102 118Z" fill="' + wing + '"/>' +
      '<path d="M100 96 Q130 68 156 84 M100 102 Q126 82 148 94" stroke="' + p.accent + '" stroke-width="1.6" fill="none" opacity=".4"/>' +
      '<path d="M178 82 q-8 12 -18 16 M170 88 q-8 10 -16 14" stroke="' + p.dark + '" stroke-width="2" fill="none" opacity=".7"/>', 2.4, -13, 100, 96) +
    /* корпус */
    '<ellipse cx="100" cy="124" rx="31" ry="35" fill="' + stone + '"/>' +
    '<path d="M76 112 q24 8 48 0 M76 132 q24 8 48 0" stroke="' + p.dark + '" stroke-width="1.8" fill="none" opacity=".4"/>' +
    /* лапы */
    '<path d="M78 152 q-12 18 -18 30 M122 152 q12 18 18 30" stroke="' + stone + '" stroke-width="7" fill="none" stroke-linecap="round"/>' +
    claws(58, 182, 4, 10, 50, p.accent) + claws(142, 182, 4, 10, 50, p.accent) +
    /* голова с рогами */
    '<ellipse cx="100" cy="98" rx="25" ry="23" fill="' + stone + '"/>' +
    '<path d="M80 88 L64 56 L94 76 Z M120 88 L136 56 L106 76 Z" fill="' + stone + '"/>' +
    '<path d="M82 84 L70 62 L92 76Z M118 84 L130 62 L108 76Z" fill="' + p.dark + '" opacity=".5"/>' +
    eyesS([[90, 96], [110, 96]], p.eye, 3.6) +
    fangs(88, 112, 24, 5, false, '#cfc8b6') +
    cracks(['M92 78 l4 8', 'M112 80 l-4 8', 'M100 140 l6 10'], '#000'), 3.8, 6) };
});

add('demon', 'Рогатый Демон', p => {
  const a = new Art();
  const flesh = a.v(p.light || p.body, p.dark), horn = a.v(p.body, '#000'), fire = a.r(p.eye, p.dark);
  return { defs: a.defs, body: shadowS(56, 10) + floatS(
    /* крылья */
    swingS('<path d="M70 100 Q38 68 10 90 Q34 96 30 120 Q56 108 70 120Z" fill="' + p.dark + '" opacity=".85"/>', 2.2, 11, 70, 100) +
    swingS('<path d="M130 100 Q162 68 190 90 Q166 96 170 120 Q144 108 130 120Z" fill="' + p.dark + '" opacity=".85"/>', 2.2, -11, 130, 100) +
    /* ноги */
    '<path d="M84 152 q-8 18 -4 28 M116 152 q8 18 4 28" stroke="' + p.dark + '" stroke-width="9" fill="none" stroke-linecap="round"/>' +
    '<path d="M72 180 q12 6 20 0 M108 180 q12 6 20 0" stroke="' + horn + '" stroke-width="5" fill="none" stroke-linecap="round"/>' +
    claws(70, 180, 3, 9, 40, p.accent) + claws(130, 180, 3, 9, 40, p.accent) +
    /* торс */
    '<path d="M72 96 Q100 74 128 96 L134 172 L66 172 Z" fill="' + flesh + '"/>' +
    ribs(100, 108, 4, 17, p.dark) +
    /* руки */
    swingS('<path d="M66 100 q-22 16 -26 46" stroke="' + flesh + '" stroke-width="9" fill="none" stroke-linecap="round"/>' +
      claws(40, 148, 4, 11, 50, '#cfc8b6'), 2.2, 11, 68, 100) +
    swingS('<path d="M134 100 q22 16 26 46" stroke="' + flesh + '" stroke-width="9" fill="none" stroke-linecap="round"/>' +
      claws(160, 148, 4, 11, 50, '#cfc8b6'), 2.2, -11, 132, 100) +
    /* голова */
    '<circle cx="100" cy="70" r="27" fill="' + flesh + '"/>' +
    '<path d="M78 52 Q56 24 64 4 Q82 24 92 44Z" fill="' + horn + '"/>' +
    '<path d="M122 52 Q144 24 136 4 Q118 24 108 44Z" fill="' + horn + '"/>' +
    '<path d="M80 50 Q62 28 68 12 Q82 28 90 44Z" fill="' + p.accent + '" opacity=".22"/>' +
    '<path d="M120 50 Q138 28 132 12 Q118 28 110 44Z" fill="' + p.accent + '" opacity=".22"/>' +
    eyesS([[89, 68], [111, 68]], p.eye, 4) +
    /* пасть */
    '<path d="M86 86 q14 13 28 0" stroke="#0a0810" stroke-width="3.4" fill="none"/>' +
    fangs(88, 88, 24, 6, false, '#f0eadc') +
    /* пылающее сердце */
    '<path d="M100 118 l-11 17 l22 0 Z" fill="' + fire + '">' +
    '<animate attributeName="opacity" values=".5;1;.5" dur="2.4s" repeatCount="indefinite"/></path>' +
    '<circle cx="100" cy="128" r="16" fill="' + p.eye + '" opacity=".18"/>', 4, 5) };
});

add('knight', 'Падший Рыцарь', p => {
  const a = new Art();
  const steel = a.v(p.light || p.body, p.dark), plate = a.v(p.body, p.dark), blade = a.h('#e6e0d0', '#8b8578');
  return { defs: a.defs, body: shadowS(50, 10) + floatS(
    /* ноги */
    '<path d="M88 154 l-4 26 M112 154 l4 26" stroke="' + plate + '" stroke-width="11" stroke-linecap="round"/>' +
    '<path d="M74 180 h24 M102 180 h24" stroke="' + p.dark + '" stroke-width="7" stroke-linecap="round"/>' +
    /* торс-кираса */
    '<path d="M74 92 Q100 78 126 92 L132 158 L68 158 Z" fill="' + plate + '"/>' +
    '<path d="M100 92 v66" stroke="' + p.dark + '" stroke-width="2.2" opacity=".6"/>' +
    '<path d="M80 106 q20 8 40 0 M80 122 q20 8 40 0" stroke="' + p.dark + '" stroke-width="2" fill="none" opacity=".5"/>' +
    '<path d="M74 92 Q100 78 126 92" stroke="' + (p.light || p.body) + '" stroke-width="2.4" fill="none" opacity=".5"/>' +
    /* наплечники с шипами */
    '<path d="M64 90 q-14 4 -18 16 q14 4 22 -4Z" fill="' + steel + '"/>' +
    '<path d="M136 90 q14 4 18 16 q-14 4 -22 -4Z" fill="' + steel + '"/>' +
    spikes(50, 92, 60, 104, 3, 8, p.accent) + spikes(150, 92, 140, 104, 3, 8, p.accent) +
    /* руки */
    swingS('<path d="M78 100 q-20 14 -26 40" stroke="' + plate + '" stroke-width="8" fill="none" stroke-linecap="round"/>' +
      '<path d="M52 138 q-6 10 -4 16" stroke="' + p.dark + '" stroke-width="7" fill="none" stroke-linecap="round"/>', 3, 9, 78, 100) +
    swingS('<path d="M122 100 q20 14 26 40" stroke="' + plate + '" stroke-width="8" fill="none" stroke-linecap="round"/>', 3, -9, 122, 100) +
    /* шлем */
    '<path d="M100 38 q-25 0 -27 27 q-1 19 9 27 l36 0 q10 -8 9 -27 q-2 -27 -27 -27Z" fill="' + steel + '"/>' +
    '<path d="M100 38 q-6 -8 -6 -16 q6 6 6 16 q0 -10 6 -16 q0 8 -6 16Z" fill="' + p.accent + '" opacity=".6"/>' +
    /* прорезь */
    '<path d="M82 66 h36 v11 h-36 Z" fill="#050408"/>' +
    '<path d="M82 66 h36 v3 h-36Z" fill="' + p.dark + '" opacity=".8"/>' +
    eyesS([[90, 72], [110, 72]], p.eye, 3) +
    '<path d="M88 86 l4 8 M100 88 l0 9 M112 86 l-4 8" stroke="#050408" stroke-width="2.6"/>' +
    /* меч */
    '<path d="M150 54 L158 30 L162 56 L154 116 Z" fill="' + blade + '"/>' +
    '<path d="M152 56 L157 34" stroke="#fff" stroke-width="1.6" opacity=".7"/>' +
    '<path d="M144 58 l24 4" stroke="' + p.accent + '" stroke-width="4" stroke-linecap="round"/>' +
    '<path d="M152 112 l-4 12 l10 0 l-4 -12Z" fill="' + p.dark + '"/>' +
    /* плащ */
    '<path d="M74 96 q-16 34 -10 66 q22 -8 36 -6 q14 -2 36 6 q6 -32 -10 -66Z" fill="' + p.dark + '" opacity=".5"/>', 4.4, 4) };
});

add('wyvern', 'Горный Вивёрн', p => {
  const a = new Art();
  const scale = a.v(p.light || p.body, p.dark), wing = a.v(p.dark, '#000'), clawC = '#d8d2c0';
  return { defs: a.defs, body: shadowS(56, 10) + floatS(
    /* крылья */
    swingS('<path d="M100 104 Q62 58 18 74 Q50 88 44 118 Q78 106 100 122Z" fill="' + wing + '"/>' +
      '<path d="M100 104 Q70 74 44 84 M100 110 Q76 88 54 96" stroke="' + p.accent + '" stroke-width="1.6" fill="none" opacity=".45"/>', 0.9, 18, 100, 106) +
    swingS('<path d="M100 104 Q138 58 182 74 Q150 88 156 118 Q122 106 100 122Z" fill="' + wing + '"/>' +
      '<path d="M100 104 Q130 74 156 84 M100 110 Q124 88 146 96" stroke="' + p.accent + '" stroke-width="1.6" fill="none" opacity=".45"/>', 0.9, -18, 100, 106) +
    /* корпус */
    '<path d="M100 124 Q90 84 108 54 Q126 74 124 110Z" fill="' + scale + '"/>' +
    spikes(96, 118, 112, 74, 5, 9, p.dark) +
    /* лапы */
    '<path d="M96 150 q-12 18 -8 30 M116 150 q10 18 8 30" stroke="' + p.dark + '" stroke-width="7" fill="none" stroke-linecap="round"/>' +
    claws(86, 180, 3, 11, 45, clawC) + claws(126, 180, 3, 11, 45, clawC) +
    /* голова */
    '<ellipse cx="112" cy="52" rx="21" ry="17" fill="' + scale + '"/>' +
    '<path d="M126 42 q20 -4 28 -18 q2 16 -12 24Z" fill="' + p.dark + '"/>' +
    '<path d="M124 50 q16 2 24 -6" stroke="' + p.accent + '" stroke-width="2" fill="none" opacity=".5"/>' +
    eyesS([[108, 48], [120, 48]], p.eye, 3.2) +
    /* пасть */
    '<path d="M104 60 q12 8 24 2" stroke="#0a0810" stroke-width="2.4" fill="none"/>' +
    fangs(106, 60, 22, 5, false, '#f0eadc') +
    /* хвост с жалом */
    '<path d="M96 150 q-24 12 -34 30" stroke="' + p.dark + '" stroke-width="6" fill="none" stroke-linecap="round"/>' +
    '<path d="M62 180 l-12 8 l4 -14Z" fill="' + p.accent + '"/>', 2.2, 9) };
});

add('moth', 'Пепельная Моль', p => {
  const a = new Art();
  const wing = a.v(p.light || p.body, p.dark), wing2 = a.v(p.body, p.dark);
  return { defs: a.defs, body: shadowS(52, 8) + floatS(
    /* крылья с глазками */
    swingS('<path d="M100 94 Q56 52 12 78 Q40 88 36 116 Q68 102 96 118Z" fill="' + wing + '"/>' +
      '<path d="M100 92 Q70 66 38 84" stroke="' + p.accent + '" stroke-width="2" fill="none" opacity=".45"/>' +
      '<circle cx="46" cy="94" r="9" fill="' + p.dark + '" opacity=".7"/>' +
      '<circle cx="46" cy="94" r="4" fill="' + p.eye + '" opacity=".55"/>' +
      '<path d="M12 78 q10 14 22 18 M20 84 q10 12 20 16" stroke="' + p.dark + '" stroke-width="2" fill="none" opacity=".6"/>', 0.55, 21, 100, 94) +
    swingS('<path d="M100 94 Q144 52 188 78 Q160 88 164 116 Q132 102 104 118Z" fill="' + wing2 + '"/>' +
      '<path d="M100 92 Q130 66 162 84" stroke="' + p.accent + '" stroke-width="2" fill="none" opacity=".45"/>' +
      '<circle cx="154" cy="94" r="9" fill="' + p.dark + '" opacity=".7"/>' +
      '<circle cx="154" cy="94" r="4" fill="' + p.eye + '" opacity=".55"/>' +
      '<path d="M188 78 q-10 14 -22 18 M180 84 q-10 12 -20 16" stroke="' + p.dark + '" stroke-width="2" fill="none" opacity=".6"/>', 0.55, -21, 100, 94) +
    /* мохнатое тело */
    '<ellipse cx="100" cy="116" rx="15" ry="31" fill="' + a.v(p.body, p.dark) + '"/>' +
    '<path d="M100 90 q0 50 0 54" stroke="' + p.dark + '" stroke-width="2" opacity=".4"/>' +
    /* усики */
    '<path d="M92 88 q-12 -22 -26 -30 M108 88 q12 -22 26 -30" stroke="' + p.dark + '" stroke-width="3" fill="none" stroke-linecap="round"/>' +
    '<circle cx="66" cy="58" r="3" fill="' + p.accent + '"/><circle cx="134" cy="58" r="3" fill="' + p.accent + '"/>' +
    eyesS([[94, 100], [106, 100]], p.eye, 3.8), 1.9, 10) };
});

/* ================================ ЛЕС И ГЛУБИНЫ ================================ */
add('treant', 'Древень-Душегуб', p => {
  const a = new Art();
  const bark = a.v(p.light || p.body, p.dark), bark2 = a.v(p.body, p.dark);
  return { defs: a.defs, body: shadowS(60, 10) + floatS(
    /* корни */
    '<path d="M86 154 q-26 6 -36 24 M114 154 q26 6 36 24" stroke="' + p.dark + '" stroke-width="9" fill="none" stroke-linecap="round"/>' +
    '<path d="M100 156 q-6 14 -10 22" stroke="' + p.dark + '" stroke-width="8" fill="none" stroke-linecap="round"/>' +
    /* ствол */
    '<rect x="84" y="108" width="32" height="74" rx="9" fill="' + bark + '"/>' +
    '<path d="M90 112 v66 M100 112 v66 M110 112 v66" stroke="' + p.dark + '" stroke-width="1.6" opacity=".45"/>' +
    /* дупло */
    '<ellipse cx="100" cy="140" rx="9" ry="13" fill="#0a0810"/>' +
    eyesS([[100, 140]], p.eye, 4.4) +
    /* ветви-руки с корявыми пальцами */
    swingS('<path d="M86 126 q-26 -8 -36 -30" stroke="' + bark + '" stroke-width="10" fill="none" stroke-linecap="round"/>' +
      '<path d="M50 96 l-14 -8 M52 100 l-12 6 M56 104 l-8 12" stroke="' + p.dark + '" stroke-width="4" fill="none" stroke-linecap="round"/>', 3.4, 10, 88, 128) +
    swingS('<path d="M114 126 q26 -8 36 -30" stroke="' + bark + '" stroke-width="10" fill="none" stroke-linecap="round"/>' +
      '<path d="M150 96 l14 -8 M148 100 l12 6 M144 104 l8 12" stroke="' + p.dark + '" stroke-width="4" fill="none" stroke-linecap="round"/>', 3.4, -10, 112, 128) +
    /* крона-череп */
    '<path d="M100 44 q-28 4 -32 28 q-2 18 15 22 q-15 -13 2 -24 q10 -9 15 2 q5 -11 15 -2 q17 11 2 24 q17 -4 15 -22 q-4 -24 -32 -28Z" fill="' + bark2 + '"/>' +
    '<path d="M78 56 q22 -10 44 0" stroke="' + p.dark + '" stroke-width="2" fill="none" opacity=".4"/>' +
    eyesS([[88, 66], [112, 66]], p.eye, 3.6) +
    '<path d="M92 80 q8 8 16 0" stroke="#0a0810" stroke-width="2.6" fill="none"/>' +
    fangs(92, 80, 16, 4, false, '#d8d2c0') +
    /* лишайник */
    '<path d="M70 90 q-6 14 -2 24 M130 92 q6 12 2 22" stroke="' + p.accent + '" stroke-width="3" fill="none" opacity=".5"/>', 4.6, 5) };
});

add('reaper', 'Жнец Полей', p => {
  const a = new Art();
  const robe = a.v(p.dark, '#000'), scythe = a.h('#d8d2c0', '#8b8578');
  const bone = a.v(p.light || p.body, p.dark);
  return { defs: a.defs, body: shadowS(52, 9) + floatS(
    glowS('<path d="M100 38 Q64 50 62 104 Q60 148 76 178 Q100 166 124 178 Q140 148 138 104 Q136 50 100 38Z" fill="' + robe + '"/>' +
      '<path d="M100 38 Q70 52 70 100" stroke="' + p.accent + '" stroke-width="2" fill="none" opacity=".3"/>', 3.4, .8, 1) +
    /* капюшон, а в нём — намёк на череп */
    '<path d="M100 40 q-28 4 -32 30 q-2 16 12 22 q-10 -14 6 -24 q14 -10 28 0 q16 10 6 24 q14 -6 12 -22 q-4 -26 -32 -30Z" fill="' + p.dark + '"/>' +
    '<ellipse cx="100" cy="86" rx="26" ry="28" fill="#050408"/>' +
    '<path d="M88 74 q12 -6 24 0 q4 6 0 10 q-12 -4 -24 0 q-4 -4 0 -10Z" fill="' + bone + '" opacity=".22"/>' +
    eyesS([[91, 84], [109, 84]], p.eye, 3.8) +
    /* складки робы и рваный подол */
    '<path d="M78 120 q22 10 44 0 M74 146 q26 10 52 0" stroke="' + p.accent + '" stroke-width="1.8" fill="none" opacity=".28"/>' +
    '<path d="M76 178 l6 10 l6 -8 l7 9 l7 -9 l6 9 l6 -9 l7 9 l6 -10" fill="' + p.dark + '"/>' +
    /* пояс с цепью */
    '<path d="M76 134 q24 8 48 0" stroke="' + p.accent + '" stroke-width="2.4" fill="none" opacity=".55"/>' +
    '<circle cx="100" cy="140" r="4.6" fill="' + p.accent + '" opacity=".7"/>' +
    /* костлявые кисти из рукавов */
    '<path d="M72 128 q-8 6 -12 14" stroke="' + bone + '" stroke-width="3.4" fill="none" stroke-linecap="round"/>' +
    '<path d="M60 142 q-4 3 -6 7 M60 142 q-1 4 -1 8 M60 142 q3 4 4 7" stroke="' + bone + '" stroke-width="2" fill="none" stroke-linecap="round"/>' +
    /* коса: древко с волокном и зазубренное лезвие */
    swingS('<path d="M146 44 q-30 6 -46 34" stroke="' + p.dark + '" stroke-width="5" fill="none"/>' +
      '<path d="M146 44 q-30 6 -46 34" stroke="' + scythe + '" stroke-width="1.4" fill="none" opacity=".5"/>' +
      '<path d="M146 44 q6 34 -14 58 q-8 -22 2 -38 q-14 4 -22 -6 q16 -14 34 -14Z" fill="' + scythe + '"/>' +
      '<path d="M148 46 q-8 30 -22 50" stroke="#fff" stroke-width="1.6" fill="none" opacity=".5"/>' +
      '<path d="M132 60 l-6 5 M126 70 l-6 5 M120 80 l-6 5" stroke="' + p.dark + '" stroke-width="1.2" fill="none" opacity=".5"/>', 5, 5, 146, 44) +
    /* искры */
    '<circle cx="66" cy="150" r="2.4" fill="' + p.eye + '" opacity=".7"><animate attributeName="opacity" values=".7;0;.7" dur="2.2s" repeatCount="indefinite"/></circle>' +
    '<circle cx="136" cy="158" r="2" fill="' + p.eye + '" opacity=".6"><animate attributeName="opacity" values=".6;0;.6" dur="1.8s" repeatCount="indefinite"/></circle>' +
    '<circle cx="112" cy="166" r="1.8" fill="' + p.eye + '" opacity=".5"><animate attributeName="opacity" values=".5;0;.5" dur="2.6s" repeatCount="indefinite"/></circle>', 4.4, 7) };
});

add('spiderling', 'Выводок Тьмы', p => {
  const a = new Art();
  const abd = a.v(p.light || p.body, p.dark);
  const lp = (x1, y1, cx, cy, x2, y2) =>
    swingS('<path d="M' + x1 + ' ' + y1 + ' Q' + cx + ' ' + cy + ' ' + x2 + ' ' + y2 + '" stroke="' + p.dark +
      '" stroke-width="5" fill="none" stroke-linecap="round"/>' +
      '<path d="M' + x2 + ' ' + y2 + ' l-3 7 M' + x2 + ' ' + y2 + ' l3 6" stroke="' + p.accent + '" stroke-width="1.6" fill="none"/>', 1.5, 14, x1, y1);
  return { defs: a.defs, body: shadowS(46, 8) + floatS(
    lp(80, 124, 54, 106, 40, 128) + lp(82, 138, 56, 140, 48, 164) +
    lp(120, 124, 146, 106, 160, 128) + lp(118, 138, 144, 140, 152, 164) +
    '<ellipse cx="100" cy="142" rx="27" ry="23" fill="' + abd + '"/>' +
    '<ellipse cx="100" cy="146" rx="18" ry="13" fill="' + p.dark + '" opacity=".45"/>' +
    '<path d="M100 126 l-8 12 l8 10 l8 -10Z" fill="' + p.accent + '" opacity=".35"/>' +
    '<ellipse cx="100" cy="120" rx="18" ry="16" fill="' + a.v(p.body, p.dark) + '"/>' +
    '<path d="M94 132 q-2 8 1 12 M106 132 q2 8 -1 12" stroke="' + p.dark + '" stroke-width="3" fill="none" stroke-linecap="round"/>' +
    eyesS([[93, 118], [107, 118]], p.eye, 3.6) +
    spikes(90, 106, 110, 106, 3, 8, p.dark), 2.8, 5) };
});

add('hydra', 'Стоглавая Гидра', p => {
  const a = new Art();
  const scale = a.v(p.light || p.body, p.dark);
  const neck = (d, tx, ty, hr, ph) =>
    swingS('<path d="' + d + '" stroke="' + scale + '" stroke-width="11" fill="none" stroke-linecap="round"/>' +
      '<circle cx="' + tx + '" cy="' + ty + '" r="' + hr + '" fill="' + scale + '"/>' +
      eyesS([[tx - 6, ty - 2], [tx + 6, ty - 2]], p.eye, 3) +
      fangs(tx - 8, ty + hr - 3, 16, 4, false, '#f0eadc'), 2.7, ph, 100, 152);
  return { defs: a.defs, body: shadowS(58, 10) + floatS(
    '<ellipse cx="100" cy="158" rx="46" ry="27" fill="' + scale + '"/>' +
    '<ellipse cx="100" cy="164" rx="38" ry="18" fill="' + p.dark + '" opacity=".4"/>' +
    spikes(68, 150, 132, 150, 6, 10, p.dark) +
    '<path d="M64 176 q-10 8 -14 16 M136 176 q10 8 14 16" stroke="' + p.dark + '" stroke-width="6" fill="none" stroke-linecap="round"/>' +
    claws(50, 190, 3, 9, 45, p.accent) + claws(150, 190, 3, 9, 45, p.accent) +
    neck('M100 152 Q74 118 56 84', 56, 78, 15, 9) +
    neck('M100 152 Q100 114 100 76', 100, 70, 17, -7) +
    neck('M100 152 Q126 118 144 84', 144, 78, 15, 9) +
    /* дополнительные головы на переднем плане */
    neck('M100 156 Q60 132 34 112', 34, 108, 12, 12) +
    neck('M100 156 Q140 132 166 112', 166, 108, 12, -12), 4.2, 5) };
});

add('void', 'Око Пустоты', p => {
  const a = new Art();
  const orb = a.r(p.dark, '#000'), iris = a.r(p.eye, p.body);
  return { defs: a.defs, body: shadowS(50, 9) + floatS(
    /* щупальца */
    '<g stroke="' + p.dark + '" stroke-width="4.5" fill="none" stroke-linecap="round" opacity=".9">' +
    swingS('<path d="M46 70 Q18 48 14 20"/>', 3.4, 9, 46, 70) +
    swingS('<path d="M154 70 Q182 48 186 20"/>', 3.4, -9, 154, 70) +
    swingS('<path d="M46 134 Q18 158 14 186"/>', 3.4, -9, 46, 134) +
    swingS('<path d="M154 134 Q182 158 186 186"/>', 3.4, 9, 154, 134) +
    '</g>' +
    /* сфера */
    '<circle cx="100" cy="100" r="56" fill="' + orb + '"/>' +
    '<circle cx="100" cy="100" r="56" fill="none" stroke="' + p.accent + '" stroke-width="1.6" opacity=".5"/>' +
    '<circle cx="100" cy="100" r="48" fill="none" stroke="' + p.dark + '" stroke-width="1.2" opacity=".7"/>' +
    /* веко */
    '<ellipse cx="100" cy="100" rx="44" ry="28" fill="' + p.body + '"/>' +
    '<ellipse cx="100" cy="100" rx="44" ry="28" fill="none" stroke="' + p.dark + '" stroke-width="1.4" opacity=".6"/>' +
    /* радужка */
    glowS('<circle cx="100" cy="100" r="19" fill="' + iris + '"/>' +
      '<circle cx="100" cy="100" r="8" fill="#0a0710"/>' +
      '<circle cx="100" cy="100" r="30" fill="' + p.eye + '" opacity=".16"/>', 3, .65, 1) +
    /* прожилки в радужке — глаз перестаёт быть плоским пятном */
    '<path d="M100 82 v10 M112 86 l-7 7 M88 86 l7 7 M118 100 h-10 M82 100 h10 M112 114 l-7 -7 M88 114 l7 -7" stroke="' + p.dark +
    '" stroke-width="1.1" fill="none" opacity=".5"/>' +
    '<circle cx="100" cy="100" r="19" fill="none" stroke="' + p.eye + '" stroke-width="1.2" opacity=".6"/>' +
    '<circle cx="94" cy="94" r="3" fill="#fff" opacity=".6"/>' +
    '<circle cx="107" cy="108" r="1.8" fill="#fff" opacity=".35"/>' +
    /* вены по склере и присоски на щупальцах */
    '<path d="M62 88 q14 6 22 14 M138 88 q-14 6 -22 14 M70 118 q14 -4 22 -8 M130 118 q-14 -4 -22 -8" stroke="' + p.accent +
    '" stroke-width="1.4" fill="none" opacity=".4"/>' +
    '<circle cx="26" cy="44" r="2.6" fill="' + p.dark + '" opacity=".8"/><circle cx="34" cy="60" r="2" fill="' + p.dark + '" opacity=".7"/>' +
    '<circle cx="174" cy="44" r="2.6" fill="' + p.dark + '" opacity=".8"/><circle cx="166" cy="60" r="2" fill="' + p.dark + '" opacity=".7"/>' +
    '<circle cx="26" cy="160" r="2.4" fill="' + p.dark + '" opacity=".7"/><circle cx="174" cy="160" r="2.4" fill="' + p.dark + '" opacity=".7"/>' +
    eyesS([[70, 80], [130, 80], [100, 138]], p.eye, 2.6), 5, 6) };
});

/* ================================ ВЛАДЫКИ ================================ */
add('lich', 'Король-Лич', p => {
  const a = new Art();
  const robe = a.v(p.dark, '#000'), bone = a.v(p.light || p.body, p.dark), orb = a.r(p.eye, p.dark);
  return { defs: a.defs, body: shadowS(56, 10) + floatS(
    glowS('<path d="M100 56 Q62 66 60 116 Q58 156 72 182 Q100 170 128 182 Q142 156 140 116 Q138 66 100 56Z" fill="' + robe + '"/>', 4, .85, 1) +
    /* складки */
    '<path d="M78 100 q22 10 44 0 M74 130 q26 10 52 0 M72 158 q28 10 56 0" stroke="' + p.accent + '" stroke-width="1.6" fill="none" opacity=".25"/>' +
    /* рёбра на груди */
    ribs(100, 96, 3, 14, bone) +
    /* посох */
    '<path d="M146 44 q-26 32 -32 62" stroke="#b9b2a2" stroke-width="4.5" fill="none"/>' +
    glowS('<circle cx="152" cy="40" r="13" fill="' + orb + '"/>' +
      '<circle cx="152" cy="40" r="22" fill="' + p.eye + '" opacity=".18"/>' +
      '<circle cx="152" cy="40" r="5" fill="#fff" opacity=".55"/>', 2.6, .5, 1) +
    '<path d="M140 108 q-6 4 -8 12 q10 0 12 -8Z" fill="' + bone + '"/>' +
    /* череп */
    glowS('<path d="M78 46 q22 -18 44 0 q11 11 3 26 q-9 11 -25 11 q-16 0 -25 -11 q-8 -15 3 -26Z" fill="' + bone + '"/>', 4, .85, 1) +
    '<ellipse cx="88" cy="62" rx="8" ry="10" fill="#06050a"/>' +
    '<ellipse cx="112" cy="62" rx="8" ry="10" fill="#06050a"/>' +
    eyesS([[88, 62], [112, 62]], p.eye, 3.4) +
    '<path d="M96 74 l4 8 l-8 0Z" fill="#0a0810"/>' +
    fangs(86, 84, 28, 6, false, bone) +
    /* корона */
    '<path d="M74 40 l9 -24 l9 15 l8 -22 l8 22 l9 -15 l9 24Z" fill="' + p.accent + '"/>' +
    '<circle cx="83" cy="20" r="3" fill="' + p.eye + '"/><circle cx="100" cy="14" r="3.4" fill="' + p.eye + '"/><circle cx="117" cy="20" r="3" fill="' + p.eye + '"/>' +
    cracks(['M84 34 l4 7', 'M116 36 l-4 7'], '#000'), 5.5, 8) };
});

add('dragon', 'Древний Дракон', p => {
  const a = new Art();
  const scale = a.v(p.light || p.body, p.dark), wing = a.v(p.dark, '#000'), horn = a.v(p.body, '#000');
  return { defs: a.defs, body: shadowS(62, 11) + floatS(
    /* крылья */
    swingS('<path d="M100 108 Q54 64 10 86 Q44 94 38 126 Q76 110 100 126Z" fill="' + wing + '"/>' +
      '<path d="M100 108 Q68 78 42 92 M100 114 Q74 90 50 100" stroke="' + p.accent + '" stroke-width="1.8" fill="none" opacity=".4"/>' +
      '<path d="M12 86 q12 16 26 20 M22 92 q12 14 24 18" stroke="' + p.dark + '" stroke-width="2.2" fill="none" opacity=".65"/>', 1.1, 17, 100, 110) +
    swingS('<path d="M100 108 Q146 64 190 86 Q156 94 162 126 Q124 110 100 126Z" fill="' + wing + '"/>' +
      '<path d="M100 108 Q132 78 158 92 M100 114 Q126 90 150 100" stroke="' + p.accent + '" stroke-width="1.8" fill="none" opacity=".4"/>' +
      '<path d="M188 86 q-12 16 -26 20 M178 92 q-12 14 -24 18" stroke="' + p.dark + '" stroke-width="2.2" fill="none" opacity=".65"/>', 1.1, -17, 100, 110) +
    /* хвост */
    swingS('<path d="M96 156 q-30 14 -44 38" stroke="' + scale + '" stroke-width="9" fill="none" stroke-linecap="round"/>' +
      '<path d="M52 194 l-14 8 l6 -16Z" fill="' + p.accent + '"/>', 2.4, 9, 96, 156) +
    /* корпус */
    '<path d="M96 132 Q84 94 100 62 Q120 82 118 120Z" fill="' + scale + '"/>' +
    spikes(100, 126, 110, 70, 6, 10, horn) +
    /* лапы */
    '<path d="M92 152 q-12 18 -8 30 M120 152 q10 18 8 30" stroke="' + p.dark + '" stroke-width="8" fill="none" stroke-linecap="round"/>' +
    claws(82, 182, 3, 12, 45, '#d8d2c0') + claws(130, 182, 3, 12, 45, '#d8d2c0') +
    /* голова */
    '<ellipse cx="112" cy="56" rx="25" ry="19" fill="' + scale + '"/>' +
    '<path d="M90 46 q-16 -14 -22 -32 q18 4 26 22Z" fill="' + horn + '"/>' +
    '<path d="M134 44 q20 -10 30 -28 q2 20 -14 30Z" fill="' + horn + '"/>' +
    '<path d="M132 52 q16 4 26 -4" stroke="' + p.accent + '" stroke-width="2" fill="none" opacity=".5"/>' +
    eyesS([[108, 52], [122, 52]], p.eye, 3.4) +
    /* пасть и пламя */
    '<path d="M100 62 q14 10 28 2" stroke="#0a0810" stroke-width="2.6" fill="none"/>' +
    fangs(102, 62, 24, 6, false, '#f0eadc') +
    glowS('<path d="M100 66 q16 8 32 2 q-8 12 -18 12 q-10 0 -14 -14Z" fill="' + p.eye + '" opacity=".5"/>', 2, .35, .85) +
    /* гребень */
    '<path d="M100 38 q8 -12 18 -14 q-4 12 -12 18Z" fill="' + p.accent + '" opacity=".6"/>', 2.6, 11) };
});

/* -------------------------------------------------------------------------
   Обёртка каталога. Старый рисунок возвращает только {defs, body};
   renderEnemy() ждёт ещё box — реальные границы рисунка.
   Тут важна точность: если рамка окажется больше фигуры, SVG растянет
   именно рамку, и тварь будет казаться мелкой в пустом квадрате.
   ------------------------------------------------------------------------- */
/* границы одного пути: понимаем ВСЕ команды SVG, включая относительные
   (строчные), иначе координаты считываются как абсолютные и рамка раздувается */
function pathBox(d) {
  const toks = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:e-?\d+)?/gi) || [];
  let x = 0, y = 0, sx = 0, sy = 0, cmd = '', i = 0;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const hit = (px, py) => {
    if (px < x0) x0 = px; if (px > x1) x1 = px;
    if (py < y0) y0 = py; if (py > y1) y1 = py;
  };
  const num = () => parseFloat(toks[i++]);
  while (i < toks.length) {
    if (/[a-z]/i.test(toks[i])) { cmd = toks[i++]; }
    else if (!cmd) { i++; continue; }
    else if (cmd === 'M') cmd = 'L';
    else if (cmd === 'm') cmd = 'l';
    switch (cmd) {
      case 'M': x = num(); y = num(); sx = x; sy = y; hit(x, y); break;
      case 'm': x += num(); y += num(); sx = x; sy = y; hit(x, y); break;
      case 'L': x = num(); y = num(); hit(x, y); break;
      case 'l': x += num(); y += num(); hit(x, y); break;
      case 'H': x = num(); hit(x, y); break;
      case 'h': x += num(); hit(x, y); break;
      case 'V': y = num(); hit(x, y); break;
      case 'v': y += num(); hit(x, y); break;
      case 'C': { const a = num(), b = num(), c = num(), e = num(), f = num(), g = num(); hit(c, e); x = f; y = g; break; }
      case 'c': { const a = num(), b = num(), c = num(), e = num(), f = num(), g = num(); hit(x + c, y + e); x += f; y += g; break; }
      case 'S': { const a = num(), b = num(), c = num(), e = num(); hit(c, e); x = a; y = b; break; }
      case 's': { const a = num(), b = num(), c = num(), e = num(); hit(x + c, y + e); x += a; y += b; break; }
      case 'Q': { const a = num(), b = num(), c = num(), e = num(); hit(a, b); hit(c, e); x = c; y = e; break; }
      case 'q': { const a = num(), b = num(), c = num(), e = num(); hit(x + a, y + b); hit(x + c, y + e); x += c; y += e; break; }
      case 'T': { x = num(); y = num(); hit(x, y); break; }
      case 't': { x += num(); y += num(); hit(x, y); break; }
      case 'A': { const a = num(), b = num(), c = num(), e = num(), f = num(), g = num(), h = num(); hit(g, h); x = g; y = h; break; }
      case 'a': { const a = num(), b = num(), c = num(), e = num(), f = num(), g = num(), h = num(); hit(x + g, y + h); x += g; y += h; break; }
      case 'Z': case 'z': x = sx; y = sy; break;
      default: i++;
    }
  }
  return isFinite(x0) ? { x0: x0, y0: y0, x1: x1, y1: y1 } : null;
}

function bbox(body) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  /* rx и ry считаем раздельно: у тени под тварью они сильно разные
     (широкая и низкая), и общий максимум раздувал кадр по высоте */
  const add = (x, y, rx, ry) => {
    if (!isFinite(x) || !isFinite(y)) return;
    rx = rx || 0; ry = (ry === undefined ? rx : ry) || 0;
    if (x - rx < x0) x0 = x - rx;
    if (x + rx > x1) x1 = x + rx;
    if (y - ry < y0) y0 = y - ry;
    if (y + ry > y1) y1 = y + ry;
  };
  let m;
  const rc = /<circle[^>]*cx="(-?[\d.]+)"[^>]*cy="(-?[\d.]+)"[^>]*r="(-?[\d.]+)"/g;
  while ((m = rc.exec(body))) add(+m[1], +m[2], +m[3]);
  /* тень под тварью тоже рисуется, значит обязана попасть в кадр */
  const re = /<ellipse([^>]*)>/g;
  while ((m = re.exec(body))) {
    const cx = (m[1].match(/cx="(-?[\d.]+)"/) || [])[1];
    const cy = (m[1].match(/cy="(-?[\d.]+)"/) || [])[1];
    const rx = (m[1].match(/rx="(-?[\d.]+)"/) || [])[1];
    const ry = (m[1].match(/ry="(-?[\d.]+)"/) || [])[1];
    if (cx === undefined || cy === undefined) continue;
    add(+cx, +cy, +(rx || 0), +(ry === undefined ? (rx || 0) : ry));
  }
  const rp = /<path([^>]*)\sd="([^"]+)"/g;
  while ((m = rp.exec(body))) {
    const pb = pathBox(m[2]);
    if (pb) { add(pb.x0, pb.y0); add(pb.x1, pb.y1); }
  }
  if (!isFinite(x0)) return { x: 0, y: 0, w: 200, h: 200 };
  /* запас: воздух вокруг фигуры плюс размах анимации (см. AMP_*) */
  const pad = 12;
  const r2 = v => Math.round(v * 100) / 100;
  return { x: r2(x0 - pad), y: r2(y0 - pad), w: r2(x1 - x0 + pad * 2), h: r2(y1 - y0 + pad * 2) };
}

const palProbe = { body: '#4a5a4a', light: '#8a9a8a', dark: '#0a0a0c', eye: '#e0e0ff', accent: '#8a6a6a' };
/* Относительный размер твари на арене. Иначе после подгонки кадра мышь
   получалась бы ростом с дракона: кадр-то у всех растягивается в один
   и тот же квадрат. Значения НЕ больше 1: единица — предел, при котором
   фигура ещё целиком помещается в кадр. */
const SIZE = {
  mouse: 0.58, bat: 0.64, spider: 0.66, slime: 0.72, wolf: 0.80,
  skeleton: 0.78, scarecrow: 0.78, rat: 0.55, golem: 0.88, gargoyle: 0.78,
  demon: 0.86, knight: 0.80, wyvern: 0.92, moth: 0.60, treant: 0.86,
  reaper: 0.78, spiderling: 0.56, hydra: 0.90, void: 0.82, lich: 0.88,
  dragon: 1.00
};

list.forEach(function (m) {
  const probe = m.fn(palProbe);
  m.box = bbox(probe.body);
  m.key = m.k;
  m.size = SIZE[m.k] || 1;
  const raw = m.fn;
  m.fn = function (pal) {
    const d = raw(pal);
    return { defs: d.defs, body: d.body, box: m.box, parts: [], size: m.size };
  };
});

return { list, byKey: k => list.find(m => m.k === k) };
})();
