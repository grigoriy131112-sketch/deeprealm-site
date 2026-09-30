/* =========================================================================
   АРТ ПРЕДМЕТОВ · у каждой вещи свой внешний вид.
   Форма зависит от слота и типа (клинок/топор/шлем...), а детали —
   заклёпки, гравировка, камни, обмотка, руны — детерминированно
   выводятся из id предмета, поэтому вещь всегда выглядит одинаково.
   Палитра — тёмная сталь и кость; цвет редкости идёт в камни и свечение.
   ========================================================================= */
window.ITEMART = (function () {
  /* детерминированный ГПСЧ: один и тот же предмет → один и тот же рисунок */
  function seeded(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  const STEEL = '#8d9099', STEEL_D = '#4a4d55', STEEL_L = '#c2c6cd';
  const BONE = '#d8d3c4', BONE_D = '#8a8578';
  const LEATHER = '#5a4a3c', LEATHER_D = '#332a22';
  const WOOD = '#5d4530', WOOD_D = '#33241a';
  const GOLD = '#c9b077', GOLD_D = '#8a7442';
  const CLOTH = '#4a4550', CLOTH_D = '#2a2730';

  /* заклёпки по контуру */
  function rivets(pts, r, fill, stroke) {
    return pts.map(p => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + r +
      '" fill="' + (fill || STEEL_L) + '" stroke="' + (stroke || STEEL_D) + '" stroke-width="0.7"/>').join('');
  }
  /* гравировка — короткие параллельные штрихи */
  function engrave(x, y, n, len, gap, rot, color) {
    let out = '';
    for (let i = 0; i < n; i++) {
      out += '<line x1="' + (x + i * gap) + '" y1="' + y + '" x2="' + (x + i * gap) + '" y2="' + (y + len) +
        '" stroke="' + color + '" stroke-width="0.9" opacity="0.65"/>';
    }
    return '<g transform="rotate(' + rot + ' ' + x + ' ' + y + ')">' + out + '</g>';
  }
  /* камень с огранкой */
  function gem(cx, cy, r, color) {
    return '<path d="M' + cx + ' ' + (cy - r) + ' L' + (cx + r * 0.8) + ' ' + cy + ' L' + cx + ' ' + (cy + r) +
      ' L' + (cx - r * 0.8) + ' ' + cy + ' Z" fill="' + color + '" stroke="#000" stroke-width="0.6" opacity="0.92"/>' +
      '<path d="M' + cx + ' ' + (cy - r) + ' L' + (cx + r * 0.8) + ' ' + cy + ' L' + cx + ' ' + cy + ' Z" fill="#fff" opacity="0.35"/>';
  }

  /* ------------------------------- ФОРМЫ ------------------------------- */
  const SHAPES = {
    weapon: (R, C) => {
      const kinds = ['blade', 'axe', 'scythe', 'hammer', 'spear', 'sickle', 'rapier', 'mace'];
      const k = kinds[Math.floor(R() * kinds.length)];
      let s = '';
      const g = (c) => 'stroke="' + c + '" stroke-width="1.1" stroke-linecap="round"';
      if (k === 'blade' || k === 'rapier') {
        const w = k === 'rapier' ? 4 : 8;
        s += '<path d="M50 10 L' + (50 + w) + ' 30 L' + (50 + w * 0.6) + ' 74 L50 82 L' + (50 - w * 0.6) + ' 74 L' + (50 - w) + ' 30 Z" fill="' + STEEL_L + '" stroke="' + STEEL_D + '" stroke-width="1"/>';
        s += '<path d="M50 12 L' + (50 + w * 0.5) + ' 32 L50 76 L' + (50 - w * 0.5) + ' 32 Z" fill="#fff" opacity="0.18"/>';
        s += '<path d="M50 18 L' + (50 + w * 0.35) + ' 34" ' + g(STEEL_D) + ' opacity="0.7"/>';
        s += '<rect x="34" y="82" width="32" height="7" rx="2" fill="' + GOLD + '" stroke="' + GOLD_D + '" stroke-width="1"/>';
        s += rivets([[38, 85], [46, 85], [54, 85], [62, 85]], 1.2, GOLD_D, GOLD_D);
        s += '<path d="M50 89 L50 122" stroke="' + LEATHER + '" stroke-width="7" stroke-linecap="round"/>';
        s += '<path d="M50 89 L50 122" stroke="' + LEATHER_D + '" stroke-width="7" stroke-linecap="round" opacity="0.35" stroke-dasharray="3 4"/>';
        s += '<path d="M44 92 L44 120 M56 92 L56 120" ' + g(LEATHER_D) + ' opacity="0.5"/>';
        s += '<circle cx="50" cy="126" r="6" fill="' + GOLD + '" stroke="' + GOLD_D + '" stroke-width="1"/>' + gem(50, 126, 3, C);
      } else if (k === 'axe') {
        s += '<path d="M50 14 L50 126" stroke="' + WOOD + '" stroke-width="8" stroke-linecap="round"/>';
        s += '<path d="M50 14 L50 126" stroke="' + WOOD_D + '" stroke-width="8" stroke-linecap="round" opacity="0.3" stroke-dasharray="4 6"/>';
        s += '<path d="M50 26 C30 30 20 46 24 62 C34 54 42 52 50 54 Z" fill="' + STEEL_L + '" stroke="' + STEEL_D + '" stroke-width="1"/>';
        s += '<path d="M50 26 C70 30 80 46 76 62 C66 54 58 52 50 54 Z" fill="' + STEEL + '" stroke="' + STEEL_D + '" stroke-width="1"/>';
        s += '<path d="M24 62 C40 58 60 58 76 62" fill="none" ' + g(STEEL_L) + '/>';
        s += engrave(40, 32, 3, 18, 8, 8, '#fff');
        s += '<rect x="46" y="20" width="8" height="46" rx="2" fill="' + STEEL_D + '" opacity="0.6"/>';
        s += rivets([[50, 24], [50, 68]], 1.5, GOLD, GOLD_D);
      } else if (k === 'scythe') {
        s += '<path d="M40 18 C74 22 84 52 62 76" fill="none" stroke="' + STEEL_L + '" stroke-width="7" stroke-linecap="round"/>';
        s += '<path d="M40 18 C74 22 84 52 62 76" fill="none" stroke="' + STEEL_D + '" stroke-width="2" stroke-linecap="round" opacity="0.5"/>';
        s += '<path d="M40 20 L40 128" stroke="' + WOOD + '" stroke-width="7" stroke-linecap="round"/>';
        s += '<path d="M40 20 L40 128" stroke="' + WOOD_D + '" stroke-width="7" stroke-linecap="round" opacity="0.3" stroke-dasharray="5 7"/>';
        s += '<circle cx="40" cy="18" r="4" fill="' + STEEL_D + '"/>';
        s += '<path d="M30 40 L50 34 M30 60 L50 54 M30 80 L50 74" ' + g(LEATHER_D) + ' opacity="0.55"/>';
        s += gem(40, 112, 4, C);
      } else if (k === 'hammer') {
        s += '<rect x="44" y="40" width="9" height="88" rx="3" fill="' + WOOD + '" stroke="' + WOOD_D + '" stroke-width="1"/>';
        s += '<rect x="20" y="18" width="58" height="28" rx="5" fill="' + STEEL + '" stroke="' + STEEL_D + '" stroke-width="1.2"/>';
        s += '<rect x="20" y="18" width="58" height="9" rx="4" fill="' + STEEL_L + '" opacity="0.55"/>';
        s += '<line x1="30" y1="22" x2="30" y2="42" stroke="' + STEEL_D + '" stroke-width="1.4"/>';
        s += '<line x1="68" y1="22" x2="68" y2="42" stroke="' + STEEL_D + '" stroke-width="1.4"/>';
        s += rivets([[26, 32], [72, 32], [48, 32]], 1.8, GOLD, GOLD_D);
        s += engrave(34, 24, 4, 6, 6, 0, '#fff');
        s += '<circle cx="48" cy="126" r="7" fill="' + STEEL_D + '"/>';
      } else if (k === 'spear') {
        s += '<path d="M50 8 L58 30 L54 78 L46 78 L42 30 Z" fill="' + STEEL_L + '" stroke="' + STEEL_D + '" stroke-width="1"/>';
        s += '<path d="M50 10 L54 32 L50 70 L46 32 Z" fill="#fff" opacity="0.2"/>';
        s += '<path d="M46 78 L54 78 L52 88 L48 88 Z" fill="' + GOLD + '" stroke="' + GOLD_D + '" stroke-width="0.8"/>';
        s += '<path d="M50 30 L50 130" stroke="' + WOOD + '" stroke-width="5" stroke-linecap="round"/>';
        s += '<path d="M50 30 L50 130" stroke="' + WOOD_D + '" stroke-width="5" stroke-linecap="round" opacity="0.3" stroke-dasharray="6 5"/>';
        s += '<path d="M44 92 L56 92 M44 100 L56 100" ' + g(LEATHER_D) + ' opacity="0.5"/>';
        s += gem(50, 82, 3, C);
      } else if (k === 'sickle') {
        s += '<path d="M36 20 C66 24 74 48 58 68 C50 56 46 40 36 20 Z" fill="' + STEEL_L + '" stroke="' + STEEL_D + '" stroke-width="1"/>';
        s += '<path d="M40 26 C60 32 66 48 58 62" fill="none" stroke="#fff" stroke-width="1" opacity="0.25"/>';
        s += '<path d="M36 20 L42 44 L44 96" fill="none" stroke="' + LEATHER + '" stroke-width="8" stroke-linecap="round"/>';
        s += '<path d="M42 44 L44 96" stroke="' + LEATHER_D + '" stroke-width="2" opacity="0.4" stroke-dasharray="3 5"/>';
        s += rivets([[38, 26]], 1.4, GOLD, GOLD_D);
        s += gem(43, 54, 3, C);
      } else { /* mace */
        s += '<rect x="45" y="44" width="8" height="86" rx="3" fill="' + WOOD + '" stroke="' + WOOD_D + '" stroke-width="1"/>';
        s += '<circle cx="49" cy="30" r="20" fill="' + STEEL + '" stroke="' + STEEL_D + '" stroke-width="1.2"/>';
        s += '<circle cx="49" cy="30" r="13" fill="none" stroke="' + STEEL_D + '" stroke-width="1.2"/>';
        [[49, 12], [67, 30], [49, 48], [31, 30], [63, 44], [35, 44]].forEach(p => {
          s += '<path d="M' + p[0] + ' ' + (p[1] - 6) + ' L' + (p[0] + 5) + ' ' + (p[1] + 4) + ' L' + (p[0] - 5) + ' ' + (p[1] + 4) + ' Z" fill="' + STEEL_L + '" stroke="' + STEEL_D + '" stroke-width="0.7"/>';
        });
        s += gem(49, 30, 6, C);
      }
      return s;
    },

    shield: (R, C) => {
      const kinds = ['kite', 'round', 'tower'];
      const k = kinds[Math.floor(R() * kinds.length)];
      let s = '';
      if (k === 'kite') {
        s += '<path d="M50 10 C74 16 82 34 82 52 C82 92 62 118 50 128 C38 118 18 92 18 52 C18 34 26 16 50 10 Z" fill="' + STEEL + '" stroke="' + STEEL_D + '" stroke-width="1.5"/>';
        s += '<path d="M50 10 C74 16 82 34 82 52 C82 92 62 118 50 128" fill="none" stroke="' + STEEL_L + '" stroke-width="2.2"/>';
        s += '<path d="M50 22 L50 118 M30 40 L70 40 M26 62 L74 62" fill="none" stroke="' + GOLD + '" stroke-width="2" opacity="0.85"/>';
        s += gem(50, 62, 9, C);
        s += rivets([[30, 26], [70, 26], [24, 50], [76, 50], [32, 92], [68, 92]], 1.6);
        s += engrave(34, 74, 3, 22, 6, -12, '#fff');
      } else if (k === 'round') {
        s += '<circle cx="50" cy="68" r="48" fill="' + STEEL + '" stroke="' + STEEL_D + '" stroke-width="1.5"/>';
        s += '<circle cx="50" cy="68" r="38" fill="none" stroke="' + STEEL_L + '" stroke-width="2"/>';
        s += '<circle cx="50" cy="68" r="22" fill="none" stroke="' + GOLD + '" stroke-width="2" opacity="0.8"/>';
        s += '<circle cx="50" cy="68" r="7" fill="' + STEEL_D + '"/>';
        s += gem(50, 68, 11, C);
        let rr = '';
        for (let i = 0; i < 12; i++) {
          const a = i / 12 * Math.PI * 2;
          rr += '<circle cx="' + (50 + Math.cos(a) * 43).toFixed(1) + '" cy="' + (68 + Math.sin(a) * 43).toFixed(1) + '" r="1.9" fill="' + STEEL_L + '" stroke="' + STEEL_D + '" stroke-width="0.6"/>';
        }
        s += rr;
      } else {
        s += '<path d="M26 10 L74 10 L78 120 C68 130 32 130 22 120 Z" fill="' + STEEL + '" stroke="' + STEEL_D + '" stroke-width="1.5"/>';
        s += '<path d="M26 10 L74 10 L77 118 C68 127 32 127 23 118 Z" fill="none" stroke="' + STEEL_L + '" stroke-width="2"/>';
        s += '<path d="M50 10 L50 122" stroke="' + STEEL_D + '" stroke-width="2"/>';
        s += '<path d="M30 34 L70 34 M30 60 L70 60 M30 86 L70 86" stroke="' + GOLD + '" stroke-width="1.6" opacity="0.75"/>';
        s += rivets([[30, 16], [70, 16], [26, 44], [74, 44], [24, 74], [76, 74], [28, 104], [72, 104]], 1.7);
        s += gem(50, 106, 6, C);
      }
      return s;
    },

    helmet: (R, C) => {
      let s = '';
      s += '<path d="M24 78 C24 34 34 16 50 16 C66 16 76 34 76 78 Z" fill="' + STEEL + '" stroke="' + STEEL_D + '" stroke-width="1.4"/>';
      s += '<path d="M50 16 C66 16 76 34 76 78" fill="none" stroke="' + STEEL_L + '" stroke-width="2"/>';
      s += '<path d="M50 20 L50 78" stroke="' + STEEL_D + '" stroke-width="1.6" opacity="0.8"/>';
      s += '<path d="M30 50 C40 44 60 44 70 50" fill="none" stroke="' + GOLD + '" stroke-width="2" opacity="0.85"/>';
      s += '<path d="M22 78 L78 78 L74 88 L26 88 Z" fill="' + STEEL_D + '" stroke="' + STEEL_D + '" stroke-width="1"/>';
      /* прорези для глаз */
      s += '<path d="M32 66 L44 66 L42 74 L32 74 Z" fill="#0b0b0e" stroke="' + STEEL_D + '" stroke-width="0.8"/>';
      s += '<path d="M56 66 L68 66 L68 74 L58 74 Z" fill="#0b0b0e" stroke="' + STEEL_D + '" stroke-width="0.8"/>';
      s += '<path d="M40 88 L44 108 M60 88 L56 108 M50 88 L50 104" stroke="' + STEEL_D + '" stroke-width="1.4" opacity="0.55"/>';
      if (R() < 0.5) s += gem(50, 54, 5, C);
      s += rivets([[28, 24], [72, 24], [26, 62], [74, 62]], 1.5);
      s += engrave(34, 26, 3, 14, 7, 12, '#fff');
      if (R() < 0.45) { /* рога */
        s += '<path d="M24 44 C8 38 6 20 16 12" fill="none" stroke="' + BONE + '" stroke-width="5" stroke-linecap="round"/>';
        s += '<path d="M76 44 C92 38 94 20 84 12" fill="none" stroke="' + BONE + '" stroke-width="5" stroke-linecap="round"/>';
        s += '<path d="M24 44 C8 38 6 20 16 12" fill="none" stroke="' + BONE_D + '" stroke-width="1.4" opacity="0.6"/>';
        s += '<path d="M76 44 C92 38 94 20 84 12" fill="none" stroke="' + BONE_D + '" stroke-width="1.4" opacity="0.6"/>';
      }
      return s;
    },

    chest: (R, C) => {
      let s = '';
      const plate = R() < 0.6;
      s += '<path d="M22 34 C34 24 66 24 78 34 L82 106 C68 116 32 116 18 106 Z" fill="' + (plate ? STEEL : LEATHER) + '" stroke="' + (plate ? STEEL_D : LEATHER_D) + '" stroke-width="1.4"/>';
      s += '<path d="M40 30 C36 62 36 92 40 112" fill="none" stroke="' + (plate ? STEEL_L : LEATHER_D) + '" stroke-width="2.4"/>';
      s += '<path d="M60 30 C64 62 64 92 60 112" fill="none" stroke="' + (plate ? STEEL_L : LEATHER_D) + '" stroke-width="2.4"/>';
      s += '<path d="M50 26 L50 114" stroke="' + STEEL_D + '" stroke-width="1.4" opacity="0.7"/>';
      s += '<path d="M18 62 L82 62" stroke="' + STEEL_D + '" stroke-width="1.6" opacity="0.7"/>';
      /* наплечники */
      s += '<path d="M18 34 C2 32 -4 46 6 58 L22 52" fill="' + STEEL + '" stroke="' + STEEL_D + '" stroke-width="1.2"/>';
      s += '<path d="M82 34 C98 32 104 46 94 58 L78 52" fill="' + STEEL + '" stroke="' + STEEL_D + '" stroke-width="1.2"/>';
      s += rivets([[26, 40], [74, 40], [24, 96], [76, 96], [50, 70], [38, 48], [62, 48]], 1.6);
      if (R() < 0.6) s += gem(50, 70, 7, C);
      if (plate) {
        s += '<path d="M30 78 L70 78 M30 88 L70 88" stroke="' + GOLD + '" stroke-width="1.5" opacity="0.7"/>';
        s += engrave(34, 34, 4, 16, 8, 0, '#fff');
      } else {
        s += '<path d="M26 30 L74 30" stroke="' + LEATHER_D + '" stroke-width="2" stroke-dasharray="4 3" opacity="0.6"/>';
      }
      return s;
    },

    gloves: (R, C) => {
      let s = '';
      s += '<path d="M34 26 L42 22 L44 52 L52 24 L60 24 L60 54 L68 30 L74 34 L70 64 L70 96 C54 108 34 106 28 96 Z" fill="' + LEATHER + '" stroke="' + LEATHER_D + '" stroke-width="1.4"/>';
      s += '<path d="M30 74 L72 74" stroke="' + STEEL_D + '" stroke-width="3"/>';
      s += '<path d="M28 62 L74 62 M28 86 L72 86" stroke="' + STEEL + '" stroke-width="2.4" opacity="0.8"/>';
      s += '<path d="M34 30 L40 28 M52 28 L52 52 M60 28 L60 52" stroke="' + LEATHER_D + '" stroke-width="1" opacity="0.5"/>';
      s += rivets([[34, 68], [66, 68], [34, 82], [66, 82]], 1.7, STEEL_L, STEEL_D);
      s += '<path d="M40 92 L44 104 M60 92 L56 104" stroke="' + STEEL_D + '" stroke-width="1.2" opacity="0.55"/>';
      if (R() < 0.55) s += gem(50, 68, 4.5, C);
      if (R() < 0.4) { /* когти */
        [[36, 26], [48, 22], [60, 24], [70, 34]].forEach(p => {
          s += '<path d="M' + p[0] + ' ' + p[1] + ' L' + (p[0] - 4) + ' ' + (p[1] - 12) + ' L' + (p[0] + 4) + ' ' + (p[1] - 2) + ' Z" fill="' + STEEL_L + '" stroke="' + STEEL_D + '" stroke-width="0.7"/>';
        });
      }
      return s;
    },

    legs: (R, C) => {
      let s = '';
      s += '<path d="M30 20 L70 20 L68 58 L62 100 L56 128 L44 128 L40 100 L32 58 Z" fill="' + STEEL + '" stroke="' + STEEL_D + '" stroke-width="1.4"/>';
      s += '<path d="M50 22 L50 126" stroke="' + STEEL_D + '" stroke-width="1.6" opacity="0.7"/>';
      s += '<path d="M30 44 L70 44 M32 74 L68 74" stroke="' + GOLD + '" stroke-width="1.6" opacity="0.75"/>';
      s += '<path d="M34 22 L34 126 M66 22 L66 126" stroke="' + STEEL_L + '" stroke-width="1.8" opacity="0.6"/>';
      s += rivets([[36, 30], [64, 30], [36, 58], [64, 58], [40, 92], [60, 92]], 1.6);
      if (R() < 0.5) s += gem(50, 102, 5, C);
      /* наколенник */
      s += '<path d="M36 96 C44 90 56 90 64 96 C60 112 40 112 36 96 Z" fill="' + STEEL_L + '" stroke="' + STEEL_D + '" stroke-width="1.2"/>';
      s += engrave(38, 26, 3, 12, 7, 0, '#fff');
      return s;
    },

    boots: (R, C) => {
      let s = '';
      s += '<path d="M34 16 L62 16 L64 68 C70 74 80 80 82 92 C84 104 74 112 60 112 L34 112 C24 112 20 104 22 94 L36 66 Z" fill="' + LEATHER + '" stroke="' + LEATHER_D + '" stroke-width="1.4"/>';
      s += '<path d="M22 94 L82 94" stroke="' + STEEL_D + '" stroke-width="4"/>';
      s += '<path d="M24 102 L82 102" stroke="' + STEEL_D + '" stroke-width="2" opacity="0.7"/>';
      s += '<path d="M36 20 L62 20" stroke="' + GOLD + '" stroke-width="2" opacity="0.8"/>';
      s += '<path d="M36 40 L40 66 M50 40 L50 66 M62 40 L60 66" stroke="' + LEATHER_D + '" stroke-width="1.2" opacity="0.55"/>';
      s += rivets([[30, 26], [66, 26], [28, 58], [68, 58]], 1.6, STEEL_L, STEEL_D);
      if (R() < 0.5) s += gem(50, 34, 5, C);
      return s;
    },

    cloak: (R, C) => {
      let s = '';
      s += '<path d="M50 14 C60 14 68 22 70 32 L86 118 C70 126 30 126 14 118 L30 32 C32 22 40 14 50 14 Z" fill="' + CLOTH + '" stroke="' + CLOTH_D + '" stroke-width="1.4"/>';
      s += '<path d="M50 14 C56 14 60 20 60 30 L58 120 L42 120 L40 30 C40 20 44 14 50 14 Z" fill="' + CLOTH_D + '" opacity="0.75"/>';
      s += '<path d="M30 32 L70 32" stroke="' + STEEL_D + '" stroke-width="3"/>';
      s += '<path d="M32 40 L68 40" stroke="' + GOLD + '" stroke-width="1.6" opacity="0.7"/>';
      s += '<path d="M24 60 C40 56 60 56 76 60 M20 84 C40 80 60 80 80 84" fill="none" stroke="' + CLOTH_D + '" stroke-width="1.2" opacity="0.6"/>';
      s += engrave(44, 44, 3, 20, 6, 0, '#fff');
      s += rivets([[38, 32], [62, 32]], 1.8, GOLD, GOLD_D);
      s += gem(50, 32, 4.5, C);
      /* капюшон */
      s += '<path d="M50 6 C60 6 66 14 64 26 L36 26 C34 14 40 6 50 6 Z" fill="' + CLOTH_D + '" stroke="' + CLOTH_D + '" stroke-width="1"/>';
      return s;
    },

    amulet: (R, C) => {
      let s = '';
      /* цепь */
      s += '<path d="M26 12 C26 44 74 44 74 12" fill="none" stroke="' + GOLD + '" stroke-width="3" stroke-linecap="round"/>';
      s += '<path d="M26 12 C26 44 74 44 74 12" fill="none" stroke="' + GOLD_D + '" stroke-width="1" stroke-dasharray="2 4" opacity="0.7"/>';
      const shape = Math.floor(R() * 3);
      if (shape === 0) {
        s += '<path d="M50 54 C66 62 74 78 66 94 C60 106 40 106 34 94 C26 78 34 62 50 54 Z" fill="' + GOLD + '" stroke="' + GOLD_D + '" stroke-width="1.4"/>';
        s += '<path d="M50 60 C61 66 67 78 61 90 C57 98 43 98 39 90 C33 78 39 66 50 60 Z" fill="none" stroke="' + GOLD_D + '" stroke-width="1" opacity="0.7"/>';
      } else if (shape === 1) {
        s += '<circle cx="50" cy="80" r="26" fill="' + GOLD + '" stroke="' + GOLD_D + '" stroke-width="1.4"/>';
        s += '<circle cx="50" cy="80" r="20" fill="none" stroke="' + GOLD_D + '" stroke-width="1"/>';
        let rr = '';
        for (let i = 0; i < 8; i++) {
          const a = i / 8 * Math.PI * 2;
          rr += '<path d="M' + (50 + Math.cos(a) * 26) + ' ' + (80 + Math.sin(a) * 26) + ' l3 -6 l-6 0 z" fill="' + GOLD + '" stroke="' + GOLD_D + '" stroke-width="0.7"/>';
        }
        s += rr;
      } else {
        s += '<path d="M50 54 L74 80 L50 106 L26 80 Z" fill="' + GOLD + '" stroke="' + GOLD_D + '" stroke-width="1.4"/>';
        s += '<path d="M50 54 L74 80 L50 80 Z" fill="#fff" opacity="0.18"/>';
      }
      s += gem(50, 80, 12, C);
      s += engrave(40, 90, 3, 8, 8, 0, '#fff');
      return s;
    },

    ring: (R, C) => {
      let s = '';
      s += '<circle cx="50" cy="78" r="30" fill="none" stroke="' + GOLD + '" stroke-width="8"/>';
      s += '<circle cx="50" cy="78" r="30" fill="none" stroke="' + GOLD_D + '" stroke-width="2"/>';
      s += '<circle cx="50" cy="78" r="34" fill="none" stroke="' + GOLD_D + '" stroke-width="1" opacity="0.6"/>';
      s += '<circle cx="50" cy="78" r="26" fill="none" stroke="' + GOLD_D + '" stroke-width="1" opacity="0.6"/>';
      const gemN = 1 + Math.floor(R() * 3);
      for (let i = 0; i < gemN; i++) {
        const a = -Math.PI / 2 + (i - (gemN - 1) / 2) * 0.55;
        s += gem(50 + Math.cos(a) * 30, 78 + Math.sin(a) * 30, 7, C);
      }
      s += rivets([[50, 108], [22, 78], [78, 78]], 2, GOLD, GOLD_D);
      s += engrave(24, 58, 3, 8, 8, -30, '#fff');
      return s;
    }
  };

  const VIEW = { w: 100, h: 136 };

  /* Общий слой микро-деталей предмета: заклёпки по контуру, зернистость
     металла, царапины, потёртости, крапины патины и пыль. */
  function microItem(R, slot, glow) {
    let s = '';
    /* зернистость материала */
    for (let i = 0; i < 150; i++) {
      const x = 6 + R() * 88, y = 6 + R() * 124, r = 0.3 + R() * 0.7;
      s += '<circle class="mote" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r.toFixed(2) +
        '" fill="' + (R() < 0.5 ? STEEL_D : STEEL_L) + '" opacity="' + (0.1 + R() * 0.26).toFixed(2) + '"/>';
    }
    /* царапины и задиры */
    for (let i = 0; i < 90; i++) {
      const x = 8 + R() * 84, y = 8 + R() * 120, a = R() * Math.PI * 2, len = 2 + R() * 6;
      s += '<line class="mote" x1="' + x.toFixed(1) + '" y1="' + y.toFixed(1) + '" x2="' + (x + Math.cos(a) * len).toFixed(1) +
        '" y2="' + (y + Math.sin(a) * len).toFixed(1) + '" stroke="' + (R() < 0.6 ? STEEL_D : '#ffffff') +
        '" stroke-width="0.35" opacity="' + (0.1 + R() * 0.24).toFixed(2) + '"/>';
    }
    /* потёртости по краям */
    for (let i = 0; i < 70; i++) {
      const x = R() * 100, y = R() * 136, r = 0.6 + R() * 1.8;
      s += '<circle class="mote" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r.toFixed(2) +
        '" fill="none" stroke="' + STEEL_D + '" stroke-width="0.3" opacity="' + (0.08 + R() * 0.2).toFixed(2) + '"/>';
    }
    /* заклёпки по контуру */
    for (let i = 0; i < 22; i++) {
      const a = i / 22 * Math.PI * 2, rr = 40 + R() * 6;
      const x = 50 + Math.cos(a) * rr, y = 68 + Math.sin(a) * rr * 1.3;
      s += '<circle class="mote" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (0.9 + R() * 0.7).toFixed(1) +
        '" fill="' + GOLD + '" stroke="' + GOLD_D + '" stroke-width="0.4" opacity="0.75"/>';
    }
    /* рунная гравировка, у каждого предмета своя */
    for (let i = 0; i < 16; i++) {
      const x = 20 + R() * 60, y = 26 + R() * 84, len = 2.4 + R() * 3.4;
      s += '<path class="mote" d="M' + x.toFixed(1) + ' ' + y.toFixed(1) + ' l' + len.toFixed(1) + ' 0 l0 ' + len.toFixed(1) + ' l' +
        (-len).toFixed(1) + ' 0" fill="none" stroke="' + glow + '" stroke-width="0.45" opacity="' + (0.16 + R() * 0.3).toFixed(2) + '"/>';
    }
    /* крапины патины и пыль */
    for (let i = 0; i < 60; i++) {
      const x = R() * 100, y = R() * 136, r = 0.4 + R() * 1.3;
      s += '<circle class="mote" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r.toFixed(2) +
        '" fill="' + (R() < 0.5 ? '#3a3226' : glow) + '" opacity="' + (0.08 + R() * 0.24).toFixed(2) + '"/>';
    }
    /* блики на металле */
    for (let i = 0; i < 24; i++) {
      const x = 14 + R() * 72, y = 10 + R() * 116, len = 3 + R() * 12;
      s += '<line class="mote" x1="' + x.toFixed(1) + '" y1="' + y.toFixed(1) + '" x2="' + x.toFixed(1) + '" y2="' + (y + len).toFixed(1) +
        '" stroke="#ffffff" stroke-width="0.5" opacity="' + (0.06 + R() * 0.14).toFixed(2) + '"/>';
    }
    return s;
  }

  /* Рисунок вещи. rarColor — цвет редкости (камни и свечение). */
  function svg(item, rarColor, size, q) {
    const R = seeded(item ? (item.id * 2654435761) >>> 0 : 1);
    const slot = (item && item.slot) || 'weapon';
    const fn = SHAPES[slot] || SHAPES.weapon;
    const gid = 'ig' + (item ? item.id : 0);
    const glow = rarColor || '#8d9099';
    let body = fn(R, glow);
    return '<svg viewBox="0 0 ' + VIEW.w + ' ' + VIEW.h + '" width="' + (size || '100%') + '" height="' + (size || '100%') +
      '" xmlns="http://www.w3.org/2000/svg" class="item-svg" data-q="' + (q || 'high') + '">' +
      '<defs>' +
      '<linearGradient id="' + gid + 's" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + STEEL_L + '" stop-opacity="0.9"/>' +
      '<stop offset="1" stop-color="' + STEEL_D + '" stop-opacity="0.2"/></linearGradient>' +
      '<radialGradient id="' + gid + 'g" cx="0.5" cy="0.5" r="0.5">' +
      '<stop offset="0" stop-color="' + glow + '" stop-opacity="0.55"/>' +
      '<stop offset="1" stop-color="' + glow + '" stop-opacity="0"/>' +
      '</radialGradient>' +
      '</defs>' +
      '<ellipse cx="50" cy="74" rx="42" ry="60" fill="url(#' + gid + 'g)"/>' +
      body +
      microItem(R, slot, glow) +
      '</svg>';
  }

  return { svg, SHAPES, STEEL, GOLD, BONE };
})();
