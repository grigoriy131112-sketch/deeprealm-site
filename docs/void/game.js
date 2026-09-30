/* =========================================================================
   ПОЖИРАТЕЛЬ ПУСТОТЫ · игровая логика.
   Чистый JS, без сборки. Все тексты — через I18N, звук — через AUDIO,
   арт монстров — MONSTERS, пейзажи — SCENES, предметы — ITEMART.
   Атака — свайп или клик по монстру (клавиатура тоже работает).
   ========================================================================= */
'use strict';

/* ---------------------------- утилиты ---------------------------- */
const $ = s => document.querySelector(s);
const $$ = s => Array.prototype.slice.call(document.querySelectorAll(s));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
const irnd = (a, b) => Math.floor(rnd(a, b + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const now = () => Date.now();
const T = (k, v) => window.I18N.t(k, v);
function fmt(n) {
  n = Math.round(n);
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1).replace('.0', '') + 'млрд';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + 'млн';
  if (Math.abs(n) >= 1e4) return (n / 1e3).toFixed(1).replace('.0', '') + 'тыс';
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
const pct = (v, d) => (v * 100).toFixed(d === undefined ? 1 : d) + '%';

/* ============================ КОНСТАНТЫ ============================ */
const MONSTERS_PER_LOC = 7;

const LOCATIONS = [
  { k: 'fields', sub: 'loc.fields.s', scene: 'fields',
    mobs: ['skeleton', 'scarecrow', 'mouse'], boss: 'reaper',
    hp: 30, dmg: 5, gold: 4, xp: 10,
    pal: { body: '#8f8a7a', light: '#c3bda9', dark: '#23252b', eye: '#a9c6dd', accent: '#55636e' },
    sky: ['#08090c', '#171a20'] },
  { k: 'forest', sub: 'loc.forest.s', scene: 'forest',
    mobs: ['wolf', 'spider', 'moth'], boss: 'treant',
    hp: 95, dmg: 12, gold: 9, xp: 22,
    pal: { body: '#4d5c3a', light: '#75874f', dark: '#141a10', eye: '#b2c86c', accent: '#7a8f4c' },
    sky: ['#050704', '#0e1509'] },
  { k: 'dungeon', sub: 'loc.dungeon.s', scene: 'dungeon',
    mobs: ['slime', 'rat', 'spiderling'], boss: 'golem',
    hp: 240, dmg: 22, gold: 16, xp: 38,
    pal: { body: '#7b5c3a', light: '#a2865c', dark: '#1d150c', eye: '#dfa352', accent: '#a07a44' },
    sky: ['#080604', '#181008'] },
  { k: 'mountains', sub: 'loc.mountains.s', scene: 'mountains',
    mobs: ['gargoyle', 'demon', 'knight'], boss: 'wyvern',
    hp: 320, dmg: 28, gold: 19, xp: 48,
    pal: { body: '#5e5a68', light: '#8a8494', dark: '#17161d', eye: '#d47050', accent: '#847a9e' },
    sky: ['#06060a', '#141320'] },
  { k: 'cathedral', sub: 'loc.cathedral.s', scene: 'cathedral',
    mobs: ['gargoyle', 'hydra', 'void'], boss: 'lich',
    hp: 1500, dmg: 78, gold: 52, xp: 130,
    pal: { body: '#675084', light: '#9a80b8', dark: '#160f21', eye: '#c5aee0', accent: '#917cc4' },
    sky: ['#060410', '#160e24'] },
  { k: 'abyss', sub: 'loc.abyss.s', scene: 'abyss',
    mobs: ['void', 'hydra', 'demon'], boss: 'dragon',
    hp: 6500, dmg: 190, gold: 120, xp: 320,
    pal: { body: '#8a3236', light: '#b85450', dark: '#140609', eye: '#dd5a58', accent: '#c2a54a' },
    sky: ['#050203', '#1a0508'] }
];
const locName = k => T('loc.' + k + '.n');
const locSub = k => T('loc.' + k + '.s');
const START_LOC = 'fields';
const locIndex = k => LOCATIONS.findIndex(l => l.k === k);
const locIdx = () => Math.max(0, locIndex(S.locKey));
const loc = () => LOCATIONS[locIdx()] || LOCATIONS[0];

/* Сопротивления тварей: урон героя делится на три вида. Физический — удары,
   огонь и лёд — магия, молния — свой вид. У каждой твари свой набор дыр:
   голем глух к металлу, но боится молнии; дракон горит плохо, зато рвётся
   от холода. Значения — доля срезанного урона (0.25 = четверть). */
const DMG_PHYS = 'phys', DMG_FIRE = 'fire', DMG_FROST = 'frost', DMG_BOLT = 'bolt';
const RES_LABEL = { phys: '⚔', fire: '🔥', frost: '❄', bolt: '⚡' };
const DEF = {
  /* базовая броня: доля срезанного физического урона, дальше растёт с глубиной */
  baseArmor: [0.00, 0.04, 0.10, 0.17, 0.24, 0.30],
  bossArmor: 0.05,
  armorPerCycle: 0.045,
  armorCap: 0.7,
  resPerCycle: 0.03,
  /* 1.0 — обычная тварь, больше — сопротивление, меньше — уязвимость.
     Потолок обязан быть выше единицы, иначе индивидуальные значения
     упираются в него и все твари становятся одинаково бронированными. */
  resCap: 1.6,
  resFloor: 0.2
};
/* у кого какие сопротивления: 1 — обычное, 0 — тварь открыта этому виду */
const MONSTER_RES = {
  mouse: { frost: 1.15 }, bat: { phys: 0.75 }, spider: { phys: 0.85 }, slime: { phys: 1.2, fire: 0.8 },
  wolf: { phys: 0.85 }, skeleton: { phys: 1.2, fire: 0.75 }, scarecrow: { fire: 1.3 },
  rat: { phys: 0.9, frost: 0.85 }, golem: { phys: 1.4, bolt: 0.6 }, gargoyle: { phys: 1.25, bolt: 0.8 },
  demon: { fire: 1.35, frost: 0.75 }, knight: { phys: 1.3, bolt: 0.85 }, wyvern: { phys: 1.15, frost: 0.8 },
  moth: { fire: 1.25, phys: 0.85 }, treant: { fire: 1.4, frost: 0.8 }, reaper: { phys: 0.9, fire: 1.2 },
  spiderling: { phys: 0.85, fire: 1.1 }, hydra: { phys: 1.25, fire: 0.85, frost: 0.85 },
  void: { phys: 0.7, bolt: 1.3 }, lich: { phys: 1.25, fire: 0.8, bolt: 0.85 }, dragon: { phys: 1.3, fire: 1.4, frost: 0.75 }
};
/* способности тварей: насколько часто, сколько снимают и как долго держатся */
const ABILITY = {
  dodge: { chance: 0.35, dur: 1.6, cd: 5.5 },
  shield: { absorb: 0.5, dur: 3.2, cd: 8.5 },
  pierce: { frac: 0.35, dur: 2.6, cd: 9.5 },
  heal: { frac: 0.22, cd: 11 },
  leech: { frac: 0.55, dur: 3.6, cd: 12 },
  reflect: { frac: 0.2, dur: 2.6, cd: 10 },
  enrage: { mult: 1.7, dur: 4.2, cd: 11 }
};
/* кто чем владеет: список пар [ключ способности, с какого круга тьмы доступна] */
const MONSTER_ABIL = {
  mouse: [['dodge', 1]],
  bat: [['dodge', 1], ['leech', 2]],
  spider: [['dodge', 1]],
  slime: [['heal', 1]],
  wolf: [['enrage', 1]],
  skeleton: [['reflect', 2]],
  scarecrow: [['dodge', 1]],
  rat: [['dodge', 1], ['heal', 3]],
  golem: [['shield', 1], ['pierce', 2]],
  gargoyle: [['shield', 1], ['dodge', 2]],
  demon: [['enrage', 1], ['reflect', 2]],
  knight: [['shield', 1], ['pierce', 3]],
  wyvern: [['dodge', 1], ['enrage', 2]],
  moth: [['dodge', 1], ['heal', 2]],
  treant: [['heal', 1], ['shield', 3]],
  reaper: [['leech', 1], ['dodge', 2]],
  spiderling: [['dodge', 1], ['reflect', 4]],
  hydra: [['heal', 1], ['enrage', 3]],
  void: [['reflect', 1], ['leech', 3]],
  lich: [['leech', 1], ['shield', 2], ['heal', 4]],
  dragon: [['shield', 1], ['enrage', 2], ['reflect', 4]]
};
function nextLoc(key) {
  const i = locIndex(key);
  return i >= 0 && i < LOCATIONS.length - 1 ? LOCATIONS[i + 1].k : null;
}

const UPGRADES = [
  { k: 'dmg', em: '⚔️', base: 24, grow: 1.155 },
  { k: 'agi', em: '💨', base: 30, grow: 1.17 },
  { k: 'crit', em: '💥', base: 40, grow: 1.18 }
];
const upgCost = u => Math.floor(u.base * Math.pow(u.grow, S.upg[u.k] || 0));

/* ---------------------------- способности ---------------------------- */
const PERKS = [
  { id: 'sharp', cat: 'phys', em: '🗡️', add: { atkPct: .08 } },
  { id: 'brutal', cat: 'phys', em: '🔨', add: { critDmg: .14 } },
  { id: 'precise', cat: 'phys', em: '🎯', add: { crit: .03 } },
  { id: 'thirst', cat: 'phys', em: '🩸', add: { lifesteal: .02 } },
  { id: 'dual', cat: 'phys', em: '⚡', add: { doubleStrike: .05 } },
  { id: 'heavy', cat: 'phys', em: '🪓', add: { atkFlat: 6 } },
  { id: 'exec', cat: 'phys', em: '☠️', add: { atkPct: .05, crit: .02 } },
  { id: 'stone', cat: 'buff', em: '🪨', add: { hpPct: .10 } },
  { id: 'swift', cat: 'buff', em: '🌪️', add: { dodge: .025 } },
  { id: 'regen', cat: 'buff', em: '💚', add: { regen: 1.2 } },
  { id: 'fury', cat: 'buff', em: '🔥', add: { atkSpeed: .05 } },
  { id: 'breath', cat: 'buff', em: '🫀', add: { hpFlat: 25, mpFlat: 5 } },
  { id: 'aura', cat: 'buff', em: '👁️', add: { enemyDmgMul: -.04 } },
  { id: 'bulwark', cat: 'buff', em: '🛡️', add: { armor: 9 } },
  { id: 'fire', cat: 'magic', em: '🔥', add: { magicPower: .08 }, spell: 'fireball' },
  { id: 'frost', cat: 'magic', em: '❄️', add: { magicPower: .06 }, spell: 'frost' },
  { id: 'bolt', cat: 'magic', em: '🌩️', add: { magicPower: .07 }, spell: 'bolt' },
  { id: 'mana', cat: 'magic', em: '🔷', add: { mpPct: .20, manaRegen: .6 } },
  { id: 'arcane', cat: 'magic', em: '✨', add: { magicPower: .12 } },
  { id: 'drain', cat: 'magic', em: '🕸️', add: { spellHeal: .03 } }
];
const PERK_BY_ID = {}; PERKS.forEach(p => PERK_BY_ID[p.id] = p);
/* Название и описание лежат в PERKS_T (по языкам), а не в плоском словаре:
   ключей perk.<id>.n/d там нет, поэтому T() вернул бы сам ключ. */
const perkName = id => window.I18N.perkText(id)[0];
const perkDesc = id => window.I18N.perkText(id)[1];

const SPELLS = [
  { k: 'fireball', em: '🔥', cost: 10, cd: 2.2, mult: 1.9 },
  { k: 'frost', em: '❄️', cost: 16, cd: 4.5, mult: 1.3, slow: 3.5 },
  { k: 'bolt', em: '🌩️', cost: 22, cd: 3.6, mult: 3.4 }
];
const SPELL_BY_K = {}; SPELLS.forEach(s => SPELL_BY_K[s.k] = s);

const SLOTS = [
  { k: 'weapon', em: '⚔️', group: 'weapon' },
  { k: 'shield', em: '🛡️', group: 'armor' },
  { k: 'helmet', em: '🪖', group: 'armor' },
  { k: 'chest', em: '🥼', group: 'armor' },
  { k: 'gloves', em: '🧤', group: 'armor' },
  { k: 'legs', em: '👖', group: 'armor' },
  { k: 'boots', em: '🥾', group: 'armor' },
  { k: 'cloak', em: '🧥', group: 'armor' },
  { k: 'amulet', em: '📿', group: 'jewel' },
  { k: 'ring', em: '💍', group: 'jewel' }
];
const SLOT_BY_K = {}; SLOTS.forEach(s => SLOT_BY_K[s.k] = s);
const slotName = k => T('slot.' + k);
const BAG_SIZE = 15;

const RARITIES = [
  { k: 'common', w: 100, af: 1, mult: 1.00, cls: 'r-common', b: 'b-common', col: '#a8a49a' },
  { k: 'uncommon', w: 46, af: 2, mult: 1.30, cls: 'r-uncommon', b: 'b-uncommon', col: '#8fb27a' },
  { k: 'rare', w: 17, af: 3, mult: 1.75, cls: 'r-rare', b: 'b-rare', col: '#7aa6d8' },
  { k: 'epic', w: 5.4, af: 4, mult: 2.40, cls: 'r-epic', b: 'b-epic', col: '#b07ad8' },
  { k: 'legendary', w: 1.5, af: 5, mult: 3.40, cls: 'r-legendary', b: 'b-legendary', col: '#d8a850' },
  { k: 'cursed', w: 0.32, af: 6, mult: 4.60, cls: 'r-cursed', b: 'b-cursed', col: '#d84850' }
];
const rarOf = k => RARITIES.find(r => r.k === k) || RARITIES[0];
const rarName = k => T('rar.' + k);

const AFFIX = {
  atkFlat: { w: 5, f: il => Math.round((3 + il * 1.6) * rnd(.85, 1.2)) },
  atkPct: { w: 3, f: il => (0.03 + il * 0.0022) * rnd(.85, 1.2), p: 1 },
  hpFlat: { w: 5, f: il => Math.round((14 + il * 6) * rnd(.85, 1.2)) },
  hpPct: { w: 3, f: il => (0.03 + il * 0.002) * rnd(.85, 1.2), p: 1 },
  mpFlat: { w: 4, f: il => Math.round((8 + il * 3) * rnd(.85, 1.2)) },
  armor: { w: 5, f: il => Math.round((2 + il * 1.1) * rnd(.85, 1.2)) },
  crit: { w: 3, f: il => (0.012 + il * 0.0011) * rnd(.8, 1.2), p: 1 },
  critDmg: { w: 3, f: il => (0.07 + il * 0.006) * rnd(.85, 1.2), p: 1 },
  atkSpeed: { w: 2.4, f: il => (0.02 + il * 0.0016) * rnd(.85, 1.2), p: 1 },
  dodge: { w: 2.6, f: il => (0.008 + il * 0.0008) * rnd(.8, 1.2), p: 1 },
  regen: { w: 3, f: il => (0.8 + il * 0.55) * rnd(.85, 1.2) },
  lifesteal: { w: 2.2, f: il => (0.008 + il * 0.0008) * rnd(.8, 1.2), p: 1 },
  magicPower: { w: 2.6, f: il => (0.05 + il * 0.004) * rnd(.85, 1.2), p: 1 },
  manaRegen: { w: 3, f: il => (0.25 + il * 0.05) * rnd(.85, 1.2) },
  goldPct: { w: 3, f: il => (0.05 + il * 0.005) * rnd(.85, 1.2), p: 1 },
  xpPct: { w: 3, f: il => (0.05 + il * 0.005) * rnd(.85, 1.2), p: 1 }
};
const AFFIX_POOL = {
  weapon: ['atkFlat', 'atkPct', 'crit', 'critDmg', 'atkSpeed', 'lifesteal'],
  armor: ['hpFlat', 'hpPct', 'armor', 'dodge', 'regen', 'mpFlat'],
  jewel: ['crit', 'critDmg', 'magicPower', 'mpFlat', 'manaRegen', 'goldPct', 'xpPct', 'lifesteal', 'hpPct']
};
const SCORE_W = { atkFlat: 2.0, atkPct: 60, hpFlat: 0.16, hpPct: 55, mpFlat: 0.5, armor: 1.1,
  crit: 700, critDmg: 80, atkSpeed: 520, dodge: 420, regen: 6, lifesteal: 340,
  magicPower: 95, manaRegen: 14, goldPct: 22, xpPct: 22 };

const ACHIEVEMENTS = [
  { k: 'first', em: '🩸', chk: S => S.kills >= 1 },
  { k: 'h100', em: '⚔️', chk: S => S.kills >= 100 },
  { k: 'h1k', em: '💀', chk: S => S.kills >= 1000 },
  { k: 'h10k', em: '☠️', chk: S => S.kills >= 10000 },
  { k: 'loot20', em: '🎁', chk: S => S.stat.drops >= 20 },
  { k: 'rich', em: '💰', chk: S => S.gold >= 1000 },
  { k: 'lvl10', em: '⭐', chk: S => S.level >= 10 },
  { k: 'clearAll', em: '🏁', chk: S => Object.keys(S.cleared).length >= LOCATIONS.length },
  { k: 'boss5', em: '👑', chk: S => Object.keys(S.bossKills).reduce((a, k) => a + S.bossKills[k], 0) >= 5 },
  { k: 'lvl25', em: '🌟', chk: S => S.level >= 25 }
];

const SAVE_KEY = 'void_devourer_v4';
const SETTINGS_KEY = 'void_devourer_settings_v1';
let S = null;

/* ---------------------------- настройки ---------------------------- */
const defaultSettings = () => ({
  lang: 'ru', showFps: false, frameLimit: 60, quality: 'high',
  master: 0.8, music: 0.45, sfx: 0.8, started: false
});
let SET = defaultSettings();

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) SET = Object.assign(defaultSettings(), JSON.parse(raw));
  } catch (e) { /* нет хранилища */ }
  window.I18N.lang = SET.lang;
  window.AUDIO.setVolumes({ master: SET.master, music: SET.music, sfx: SET.sfx });
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(SET)); } catch (e) { /* нет хранилища */ }
}

/* ---------------------------- состояние ---------------------------- */
function freshState() {
  const eq = {}; SLOTS.forEach(s => eq[s.k] = null);
  return {
    v: 4,
    level: 1, xp: 0, gold: 0, hp: null, mp: null,
    locKey: START_LOC, idx: 1, cycle: 0, cleared: {},
    kills: 0, deaths: 0, resSeen: {},
    upg: { dmg: 0, agi: 0, crit: 0 },
    perks: {}, spells: { fireball: 1 },
    kn: { fireball: 0, frost: 0, bolt: 0 }, kp: 0,
    inv: [], eq: eq, chests: [],
    potions: 2, mpotions: 1,
    bossKills: {}, pendingPerks: 0,
    shopStock: [],
    stat: { cursed: 0, spells: 0, upgrades: 0, perks: 0, drops: 0, best: 0 },
    ach: {}, startTs: now(), lastTs: now()
  };
}

function save() {
  if (!S) return;
  try { S.lastTs = now(); localStorage.setItem(SAVE_KEY, JSON.stringify(S)); }
  catch (e) { /* играем без сохранения */ }
}
function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw), base = freshState(), st = Object.assign(base, d);
    st.upg = Object.assign(base.upg, d.upg || {});
    st.perks = d.perks || {};
    st.spells = Object.assign({ fireball: 1 }, d.spells || {});
    st.kn = Object.assign({ fireball: 0, frost: 0, bolt: 0 }, d.kn || {});
    st.kp = d.kp || 0;
    st.stat = Object.assign(base.stat, d.stat || {});
    st.bossKills = d.bossKills || {};
    st.eq = Object.assign(base.eq, d.eq || {});
    st.inv = Array.isArray(d.inv) ? d.inv : [];
    st.ach = d.ach || {};
    st.cleared = d.cleared || {};
    st.resSeen = d.resSeen || {};
    st.chests = Array.isArray(d.chests) ? d.chests : [];
    st.shopStock = Array.isArray(d.shopStock) ? d.shopStock : [];
    if (locIndex(st.locKey) < 0) st.locKey = START_LOC;
    return st;
  } catch (e) { return null; }
}
function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
}

/* ============================== ПРОИЗВОДНЫЕ ============================== */
const xpNeed = l => Math.floor(50 * Math.pow(l, 1.5) + 40 * l);
const itemScore = it => !it ? 0 : it.affixes.reduce((a, f) => a + f.v * (SCORE_W[f.k] || 0), 0);
const sellValue = it => Math.round((it.ilvl * 2 + itemScore(it) * 0.08) * (1 + rarOf(it.rar).af * 0.35));

function perkAdd(key) {
  let v = 0;
  for (const id in S.perks) {
    const p = PERK_BY_ID[id];
    if (p && p.add && p.add[key]) v += p.add[key] * S.perks[id];
  }
  return v;
}
const spellLv = k => S.spells[k] || 0;

/* ============================== ДРЕВО ЗНАНИЙ ============================== */
/* Механика узлов живёт в knowledge.js, здесь — мостик к состоянию игры.
   Суммы по веткам кэшируются по числу изученных узлов: stats() зовётся
   каждый кадр, и пересчитывать дерево каждый раз незачем. */
let knCache = null, knCacheKey = '';

function knSum(b) {
  return window.KNOWLEDGE.sum(S || { kn: {}, kp: 0 }, b);
}
function knAll() {
  const key = S ? ((S.kn.fireball || 0) + '.' + (S.kn.frost || 0) + '.' + (S.kn.bolt || 0)) : '';
  if (knCache && knCacheKey === key) return knCache;
  knCacheKey = key;
  knCache = { fireball: knSum('fireball'), frost: knSum('frost'), bolt: knSum('bolt') };
  return knCache;
}
const knLv = b => (S && S.kn ? (S.kn[b] || 0) : 0);
const knName = (b, i) => window.I18N.knText(b, i)[0];
const knDesc = (b, i) => window.I18N.knText(b, i)[1];

/* Очки знаний: копятся с убийств, Владык, уровней и сундуков. */
function gainKp(n) {
  if (!S || !n) return;
  S.kp += n;
  markTab('kn');
}

function buyNode(b, i) {
  if (!window.KNOWLEDGE.canBuy(S, b, i)) return;
  window.KNOWLEDGE.buy(S, b, i);
  const st = stats();
  S.hp = Math.min(st.maxHp, S.hp); S.mp = Math.min(st.maxMp, S.mp);
  SFX('level');
  toast('📖', knName(b, i), 'gold');
  renderAll();
  save();
}

/* Поджог: каст оставляет на твари горение. Один очаг на вид урона —
   повторный каст освежает силу и время, а не плодит очаги. */
const BURNS = {};
function applyBurn(type, dps, time) {
  const cur = BURNS[type];
  BURNS[type] = { dps: Math.max(dps, cur ? cur.dps : 0), t: Math.max(time, cur ? cur.t : 0), acc: 0 };
}
function tickBurns(dt) {
  for (const k in BURNS) {
    const b = BURNS[k];
    b.t -= dt;
    b.acc += b.dps * dt;
    if (b.acc >= 1) {
      const d = Math.floor(b.acc); b.acc -= d;
      dealDamage(d, { dot: true, flat: true, type: k, magic: true, silent: true });
    }
    if (b.t <= 0 || !enemy || enemy.hp <= 0) delete BURNS[k];
  }
}
function clearBurns() { for (const k in BURNS) delete BURNS[k]; }

function stats() {
  const lvl = S.level;
  const a = {
    atkFlat: 0, atkPct: 0, hpFlat: 0, hpPct: 0, mpFlat: 0, mpPct: 0, armor: 0,
    crit: 0, critDmg: 0, atkSpeed: 0, dodge: 0, regen: 0, lifesteal: 0,
    magicPower: 0, manaRegen: 0, goldPct: 0, xpPct: 0, doubleStrike: 0, enemyDmgMul: 0, spellHeal: 0
  };
  SLOTS.forEach(sl => {
    const it = S.eq[sl.k]; if (!it) return;
    it.affixes.forEach(f => { a[f.k] = (a[f.k] || 0) + f.v; });
  });
  for (const key in a) a[key] += perkAdd(key);

  /* древо знаний: сила магии, мана и вампиризм от заклинаний */
  const kn = knAll();
  for (const b of window.KNOWLEDGE.BRANCHES) {
    a.magicPower += kn[b].magicPower;
    a.mpPct += kn[b].mpPct;
    a.manaRegen += kn[b].manaRegen;
    a.spellHeal += kn[b].spellHeal;
  }

  const st = {};
  st.maxHp = Math.round((100 + 10 * (lvl - 1) + a.hpFlat) * (1 + a.hpPct));
  st.maxMp = Math.round((40 + 4 * (lvl - 1) + a.mpFlat) * (1 + a.mpPct));
  st.manaRegen = 1.5 + a.manaRegen;
  st.atk = (10 + a.atkFlat) * (1 + 0.06 * S.upg.dmg + a.atkPct);
  st.atkInterval = Math.max(0.14, 1.0 / (1 + a.atkSpeed));
  st.crit = clamp(0.05 + a.crit, 0, 0.8);
  st.critDmg = 1.5 + 0.03 * S.upg.crit + a.critDmg;
  st.dodge = clamp(0.012 * S.upg.agi + a.dodge, 0, 0.55);
  st.regen = a.regen;
  st.lifesteal = clamp(a.lifesteal, 0, 0.6);
  st.armor = a.armor;
  st.dmgReduction = st.armor / (st.armor + 60 + 6 * lvl);
  st.magicPower = 1 + a.magicPower;
  st.goldMul = 1 + a.goldPct;
  st.xpMul = 1 + a.xpPct;
  st.doubleStrike = clamp(a.doubleStrike, 0, 0.6);
  st.enemyDmgMul = clamp(1 + a.enemyDmgMul, 0.4, 1);
  st.spellHeal = a.spellHeal;
  st.atk = Math.max(1, st.atk);
  return st;
}

/* ================================ ПРЕДМЕТЫ ================================ */
let uid = 1;

function rollRarity(bonus) {
  const w = RARITIES.map(r => r.k === 'common' ? r.w : r.w * (1 + (bonus || 0)));
  const tot = w.reduce((a, b) => a + b, 0);
  let r = Math.random() * tot;
  for (let i = 0; i < RARITIES.length; i++) { r -= w[i]; if (r <= 0) return RARITIES[i]; }
  return RARITIES[0];
}

function rollItem(ilvl, forceRar) {
  ilvl = Math.max(1, Math.round(ilvl));
  const slot = pick(SLOTS).k;
  const group = SLOT_BY_K[slot].group;
  const rar = forceRar || rollRarity(0);
  const pool = AFFIX_POOL[group].slice(), affixes = [];
  for (let i = 0; i < rar.af; i++) {
    const k = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    if (!k) break;
    const def = AFFIX[k];
    affixes.push({ k, v: def.f(ilvl) * rar.mult, p: def.p });
  }
  const W = window.I18N.words;
  let name = pick(W('pre')) + ' ' + pick(W(null, slot));
  if (rar.af >= 4) name += ' ' + pick(W('suf'));
  const it = { id: uid++, name, slot, ilvl, rar: rar.k, affixes, score: 0 };
  it.score = Math.round(itemScore(it));
  return it;
}

const AFFIX_NAMES = {
  ru: { atkFlat: 'к урону', atkPct: '% к урону', hpFlat: 'к здоровью', hpPct: '% к здоровью',
    mpFlat: 'к мане', armor: 'брони', crit: '% крит. шанса', critDmg: '% крит. урона',
    atkSpeed: '% скорости атаки', dodge: '% уклонения', regen: 'здоровья/сек',
    lifesteal: '% вампиризма', magicPower: '% силы магии', manaRegen: 'маны/сек',
    goldPct: '% золота', xpPct: '% опыта' },
  en: { atkFlat: 'to damage', atkPct: '% damage', hpFlat: 'to health', hpPct: '% health',
    mpFlat: 'to magicka', armor: 'armor', crit: '% crit chance', critDmg: '% crit damage',
    atkSpeed: '% attack speed', dodge: '% evasion', regen: 'health/sec',
    lifesteal: '% lifesteal', magicPower: '% spell power', manaRegen: 'magicka/sec',
    goldPct: '% gold', xpPct: '% experience' },
  zh: { atkFlat: '伤害', atkPct: '% 伤害', hpFlat: '生命', hpPct: '% 生命', mpFlat: '法力',
    armor: '护甲', crit: '% 暴击率', critDmg: '% 暴击伤害', atkSpeed: '% 攻击速度',
    dodge: '% 闪避', regen: '生命/秒', lifesteal: '% 吸血', magicPower: '% 法术强度',
    manaRegen: '法力/秒', goldPct: '% 金币', xpPct: '% 经验' },
  es: { atkFlat: 'al daño', atkPct: '% de daño', hpFlat: 'a la salud', hpPct: '% de salud',
    mpFlat: 'a la magia', armor: 'de armadura', crit: '% de prob. crítica', critDmg: '% de daño crítico',
    atkSpeed: '% de vel. de ataque', dodge: '% de evasión', regen: 'salud/seg',
    lifesteal: '% de robo de vida', magicPower: '% de poder mágico', manaRegen: 'magia/seg',
    goldPct: '% de oro', xpPct: '% de experiencia' },
  pl: { atkFlat: 'do obrażeń', atkPct: '% obrażeń', hpFlat: 'do życia', hpPct: '% życia',
    mpFlat: 'do many', armor: 'pancerza', crit: '% szansy krytyka', critDmg: '% obrażeń krytycznych',
    atkSpeed: '% szybkości ataku', dodge: '% uniku', regen: 'życia/sek',
    lifesteal: '% wampiryzmu', magicPower: '% mocy czarów', manaRegen: 'many/sek',
    goldPct: '% złota', xpPct: '% doświadczenia' }
};
const affixText = f => {
  const nm = (AFFIX_NAMES[window.I18N.lang] || AFFIX_NAMES.ru)[f.k] || f.k;
  return '+' + (f.p ? pct(f.v, 1) : fmt(f.v)) + ' ' + nm;
};

const lootIlvl = () => (locIdx() + 1) * 8 + S.cycle * 4 + irnd(-2, 2);

function addToBag(it) {
  if (it.rar === 'cursed') S.stat.cursed++;
  if (S.inv.length < BAG_SIZE) { S.inv.push(it); S.stat.drops++; return true; }
  logLine('<b style="color:#d84850">' + T('log.bagFull') + ' ' + it.name + ' ' + T('log.lost') + '</b>');
  return false;
}

/* ------------------------------ сундуки ------------------------------ */
const CHEST_KINDS = [
  { k: 'wood', em: '📦', mul: 1.0 }, { k: 'iron', em: '🧰', mul: 1.3 },
  { k: 'gold', em: '🎁', mul: 1.7 }, { k: 'curse', em: '☠️', mul: 2.2 }
];
function makeChest(ilvl, boss) {
  const kind = boss ? pick(CHEST_KINDS.slice(1)) : CHEST_KINDS[0];
  const n = irnd(1, 2) + (boss ? 1 : 0);
  const items = [];
  for (let i = 0; i < n; i++) items.push(rollItem(ilvl + irnd(0, 3), null));
  const gold = Math.round((10 + ilvl * 3) * kind.mul * rnd(0.9, 1.4));
  return { id: uid++, k: kind.k, em: kind.em, ilvl, items, gold,
    potions: Math.random() < 0.5 ? 1 : 0, mpotions: Math.random() < 0.4 ? 1 : 0,
    name: kind.em + ' ' + (kind.k === 'wood' ? 'Сундук' : kind.k === 'iron' ? 'Кованый Сундук'
      : kind.k === 'gold' ? 'Золочёный Сундук' : 'Проклятый Ларец') };
}
function openChest(id) {
  const i = S.chests.findIndex(c => c.id === id); if (i < 0) return;
  const c = S.chests[i];
  S.gold += c.gold; S.potions += c.potions; S.mpotions += c.mpotions;
  c.items.forEach(it => addToBag(it));
  S.chests.splice(i, 1); SFX('chest');
  gainKp(window.KNOWLEDGE.reward.chest);
  toast('📦 ' + T('log.chestOpen'), '+' + fmt(c.gold) + '◉ · +' + window.KNOWLEDGE.reward.chest + '📖', 'gold');
  logLine('<b style="color:#cfcfd6">' + T('log.chestOpen') + ':</b> ' + c.name + ' · +' + fmt(c.gold) + '◉');
  renderAll();
}
function openAllChests() { S.chests.slice().forEach(c => openChest(c.id)); }

/* ============================== ЗВУК ============================== */
const SFX = name => window.AUDIO.play(name);

/* ============================== ИНТЕРФЕЙС ============================== */
function toast(title, text, kind) {
  const el = document.createElement('div');
  el.className = 'toast ' + (kind || '');
  el.innerHTML = '<b>' + title + '</b>' + (text ? '<span>' + text + '</span>' : '');
  $('#toasts').appendChild(el);
  setTimeout(() => el.classList.add('on'), 10);
  setTimeout(() => { el.classList.remove('on'); setTimeout(() => el.remove(), 400); }, 2600);
}
function logLine(html) {
  const log = $('#combat-log'); if (!log) return;
  const d = document.createElement('div');
  d.className = 'log-line'; d.innerHTML = html;
  log.appendChild(d);
  while (log.children.length > 9) log.removeChild(log.firstChild);
}
function floatDmg(text, cls) {
  const layer = $('#dmg-layer'); if (!layer) return;
  const s = document.createElement('span');
  s.className = 'dmg ' + (cls || '');
  s.textContent = text;
  s.style.left = rnd(32, 62) + '%';
  s.style.top = rnd(26, 50) + '%';
  layer.appendChild(s);
  setTimeout(() => s.remove(), 950);
}

/* ============================== БОЙ ============================== */
let enemy = null, respawning = false, spellCd = {};
const clearedOf = k => S.cleared[k] || 0;

function makeEnemy() {
  const L = loc(), idx = S.idx;
  const isBoss = idx >= MONSTERS_PER_LOC;
  const key = isBoss ? L.boss : L.mobs[(idx - 1) % L.mobs.length];
  const m = window.MONSTERS.byKey(key) || window.MONSTERS.list[0];
  const cycleMul = 1 + S.cycle * 0.85;
  const lvlMul = Math.pow(1.16, S.cycle * LOCATIONS.length + locIdx());
  const hpBase = L.hp * (isBoss ? 5.2 : 1) * (0.85 + idx * 0.05);
  const hp = Math.round(hpBase * lvlMul * cycleMul);

  /* Броня и сопротивления растут с глубиной: каждый круг тьмы делает тварей
     крепче, и упираться только в здоровье перестаёт работать. */
  const depth = locIdx() + S.cycle * LOCATIONS.length;
  const armor = Math.min(DEF.armorCap, DEF.baseArmor[locIdx()] + (isBoss ? DEF.bossArmor : 0) +
    S.cycle * DEF.armorPerCycle + Math.min(0.1, depth * 0.004));
  const rMul = 1 + S.cycle * DEF.resPerCycle;
  const base = MONSTER_RES[key] || {};
  const res = { phys: 1, fire: 1, frost: 1, bolt: 1 };
  for (const t in res) res[t] = Math.min(DEF.resCap, Math.max(DEF.resFloor, res[t] * (base[t] || 1) * rMul));
  /* открытость виду: где сопротивление ниже 0.9 — там по твари бьют больнее */
  const weak = Object.keys(res).filter(t => res[t] < 0.9);

  const abil = (MONSTER_ABIL[key] || []).filter(a => (a[1] || 1) <= S.cycle + 1).map(a => a[0]);
  /* не оставляем тварь без умения: если все её способности ещё закрыты
     глубиной, берём первую — иначе поздние круги тьмы не добавляли бы угрозы */
  const pick = abil.length ? abil[(idx - 1 + S.cycle) % abil.length]
    : (MONSTER_ABIL[key] && MONSTER_ABIL[key].length ? MONSTER_ABIL[key][0][0] : null);

  return {
    key, art: m, boss: isBoss,
    name: (isBoss ? '👑 ' : '') + T('mob.' + key),
    hp, maxHp: hp,
    armor, res, weak, abil, ability: pick,
    shield: 0, pierce: 0, reflect: 0, leech: 0, enrage: 0, dodging: 0,
    abilCd: pick ? 3.2 : 0, shieldHp: 0,
    dmg: L.dmg * (isBoss ? 1.6 : 1) * lvlMul * (0.95 + Math.random() * 0.1),
    interval: isBoss ? 2.4 : rnd(2.4, 3.4),
    reward: { gold: Math.round(L.gold * (isBoss ? 9 : 1)), xp: Math.round(L.xp * (isBoss ? 7 : 1)) },
    slow: 0
  };
}

function spawnEnemy() {
  respawning = false;
  enemy = makeEnemy();
  spellCd = {};
  clearBurns();
  renderEnemy();
  if (enemy.boss) { SFX('boss'); logLine('<b>' + enemy.name + '</b> ' + T('log.blocks')); }
}

const timers = { atk: 0, en: 0, regen: 0, mana: 0 };

function gainXp(n) {
  S.xp += n;
  let ups = 0;
  while (S.xp >= xpNeed(S.level)) {
    S.xp -= xpNeed(S.level); S.level++; S.pendingPerks++; ups++;
    gainKp(window.KNOWLEDGE.reward.level);
    const st = stats();
    S.hp = st.maxHp; S.mp = st.maxMp;
    if (S.level % 5 === 0) { S.potions++; S.mpotions++; }
  }
  if (ups > 0) {
    SFX('level');
    toast('⬆️ ' + T('log.levelUp') + ' ' + S.level, T('toast.level'), 'gold');
    markTab('inv');
    logLine('<b>' + T('log.levelUp') + ' ' + S.level + '</b>');
    queuePerkChoice();
  }
}

/* Возвращает нанесённый урон: поджогу нужна доля от него, а не от кратности. */
function dealDamage(mult, opts) {
  if (!enemy || respawning) return 0;
  opts = opts || {};
  const st = stats();
  /* поджог приходит уже готовым числом урона (opts.flat), удар — кратностью */
  let dmg = opts.flat ? mult : st.atk * mult * rnd(0.92, 1.08);
  /* крит заклинания считается по древу знаний, удар — по обычному шансу */
  const critChance = opts.crit !== undefined ? opts.crit : st.crit;
  const critMul = opts.critDmg !== undefined ? (1.5 + opts.critDmg) : st.critDmg;
  const crit = !opts.flat && (opts.alwaysCrit || Math.random() < critChance);
  if (crit) dmg *= critMul;

  /* тварь может уйти от удара целиком — тогда урона нет вовсе */
  if (!opts.dot && enemy.dodging > 0 && Math.random() < 0.6) {
    floatDmg(T('st.dodge'), 'miss');
    return 0;
  }

  /* броня режет только физический урон, сопротивления — каждый свой вид */
  const type = opts.type || DMG_PHYS;
  const armor = type === DMG_PHYS ? (enemy.armor || 0) : 0;
  const res = (enemy.res && enemy.res[type]) || 1;
  dmg = Math.max(1, Math.round(dmg * (1 - armor) / res));

  /* щит твари держит часть урона, пока не рассыплется */
  if (enemy.shieldHp > 0) {
    const soak = Math.min(enemy.shieldHp, Math.round(dmg * (enemy.shield || 0)));
    enemy.shieldHp -= soak; dmg -= soak;
    if (soak > 0) floatDmg('🛡', 'miss');
    if (dmg <= 0) { updateEnemyBar(); return 0; }
  }

  enemy.hp -= dmg;
  if (dmg > S.stat.best) S.stat.best = dmg;

  const art = $('#enemy-art');
  if (art) { art.classList.remove('hit'); void art.offsetWidth; art.classList.add('hit'); }
  floatDmg((crit ? '✸' : '') + fmt(dmg), opts.magic ? 'magic' : (crit ? 'crit' : ''));
  if (crit) SFX('crit'); else if (!opts.silent) SFX('hit');

  /* отражение: тварь возвращает часть удара герою. Вампиризм не спасает —
     лечение считается после, поэтому им нельзя пересидеть отражение. */
  if (enemy.reflect > 0 && !opts.dot) {
    const back = Math.max(1, Math.round(dmg * enemy.reflect));
    S.hp -= back;
    floatDmg('-' + fmt(back), 'player');
    if (S.hp <= 0) { playerDeath(); return dmg; }
  }

  /* поджог не вампирит: иначе горение стало бы бесплатным лечением */
  if (st.lifesteal > 0 && !opts.dot) S.hp = Math.min(st.maxHp, S.hp + dmg * st.lifesteal);
  if (opts.heal) S.hp = Math.min(st.maxHp, S.hp + st.maxHp * opts.heal);

  updateEnemyBar();
  if (enemy.hp <= 0) killEnemy();
  return dmg;
}

function basicAttack(bySwipe) {
  if (!enemy || respawning) return;
  dealDamage(bySwipe ? 1.25 : 1, {});
  if (enemy && enemy.hp > 0 && Math.random() < stats().doubleStrike) {
    logLine('⚡ ✕2');
    dealDamage(0.7, { silent: true });
  }
}

function killEnemy() {
  if (respawning) return;
  respawning = true;
  const st = stats(), r = enemy.reward, L = loc();

  const gold = Math.round(r.gold * st.goldMul * rnd(0.9, 1.15));
  const xp = Math.round(r.xp * st.xpMul);
  S.gold += gold; S.kills++;
  if (enemy.boss) S.bossKills[enemy.key] = (S.bossKills[enemy.key] || 0) + 1;

  logLine(T('log.killed') + ' <b>' + enemy.name + '</b> · +' + fmt(gold) + '◉ · +' + fmt(xp) + ' ' + T('bar.xp'));
  gainKp(enemy.boss ? window.KNOWLEDGE.reward.boss : window.KNOWLEDGE.reward.kill);
  SFX('kill');
  burst(enemy.boss ? 40 : 16, L.pal.accent);
  gainXp(xp);

  if (!enemy.boss) {
    const roll = Math.random();
    if (roll < 0.30) {
      addToBag(rollItem(lootIlvl(), null));
    } else if (roll < 0.42) {
      S.potions++; logLine('<span style="color:#9fd8a8">' + T('log.loot') + ': 🧪</span>');
    } else if (roll < 0.52) {
      S.mpotions++; logLine('<span style="color:#9dc4e8">' + T('log.loot') + ': 🔷</span>');
    } else if (roll < 0.68) {
      const purse = Math.round(gold * rnd(0.5, 1.1));
      S.gold += purse; logLine('<span style="color:#cfcfd6">' + T('log.loot') + ': +' + fmt(purse) + '◉</span>');
    }
  }

  if (enemy.boss) {
    const chest = makeChest(lootIlvl(), true);
    S.chests.push(chest);
    logLine('<b style="color:#cfcfd6">' + T('log.chest') + ': ' + chest.name + '</b>');
    toast('📦 ' + T('log.chest'), T('toast.chest'), 'gold');
    SFX('loot');
  }

  if (enemy.boss) {
    S.cleared[L.k] = clearedOf(L.k) + 1;
    const nxt = nextLoc(L.k);
    if (nxt) {
      S.locKey = nxt; S.idx = 1;
      toast('⚑ ' + locName(nxt), locSub(nxt), 'blood');
      logLine('<b style="color:#cfcfd6">' + T('log.goNext') + ' ' + locName(nxt) + '</b>');
    } else {
      S.cycle++; S.locKey = START_LOC; S.idx = 1;
      toast('🌀 ' + T('zone.cycle') + ' ' + (S.cycle + 1), '', 'blood');
      logLine('<b style="color:#cfcfd6">' + T('log.goNext') + ' ' + locName(START_LOC) + '</b>');
    }
  } else {
    S.idx++;
  }

  checkAchievements();
  renderAll();

  const art = $('#enemy-art');
  if (art) {
    art.classList.add('dead');
    setTimeout(() => { art.classList.remove('dead'); spawnEnemy(); }, 360);
  }
}

/* ============================ СПОСОБНОСТИ ТВАРЕЙ ============================ */
/* Раз в несколько секунд тварь применяет своё умение. Ключевое здесь —
   оно бьёт по слабому месту героя: щит глушит урон, отражение наказывает
   за вампиризм, высасывание лечит тварь за твой же удар. */
function enemyAbility() {
  const e = enemy, a = e.ability;
  if (!a) return;
  const cfg = ABILITY[a];
  e.abilCd = cfg.cd * rnd(0.9, 1.1);
  const nm = T('ab.' + a + '.n');
  switch (a) {
    case 'dodge':
      e.dodging = cfg.dur; break;
    case 'shield':
      e.shield = cfg.absorb; e.shieldHp = Math.round(e.maxHp * 0.16); break;
    case 'pierce':
      e.pierce = cfg.frac; break;
    case 'heal':
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * cfg.frac);
      floatDmg('+' + fmt(Math.round(e.maxHp * cfg.frac)), 'magic');
      updateEnemyBar(); break;
    case 'leech':
      e.leech = cfg.frac; break;
    case 'reflect':
      e.reflect = cfg.frac; break;
    case 'enrage':
      e.enrage = cfg.mult; break;
  }
  toast(e.boss ? '👑' : '🌀', e.name.replace(/^👑 /, '') + ': ' + nm, 'arcane');
  logLine('<b style="color:#c9a0ff">' + nm + '</b> — ' + e.name);
}

function tickEnemy(dt) {
  const e = enemy;
  if (!e) return;
  for (const k of ['dodging', 'shield', 'pierce', 'reflect', 'leech', 'enrage']) {
    if (e[k] > 0) {
      e[k] = Math.max(0, e[k] - dt);
      if (e[k] === 0 && k === 'shield') { e.shield = 0; e.shieldHp = 0; }
      if (e[k] === 0 && k === 'enrage') { e.enrage = 0; }
    }
  }
  if (e.ability) {
    e.abilCd -= dt;
    if (e.abilCd <= 0) enemyAbility();
  }
  renderEnemyStatus();
}

/* Значки того, что тварь делает прямо сейчас, и её слабости к видам урона */
function renderEnemyStatus() {
  const box = $('#enemy-status');
  if (!box || !enemy) return;
  const tags = [];
  if (enemy.dodging > 0) tags.push('💨 ' + T('ab.dodge.n'));
  if (enemy.shieldHp > 0) tags.push('🛡 ' + T('ab.shield.n'));
  if (enemy.pierce > 0) tags.push('🩸 ' + T('ab.pierce.n'));
  if (enemy.reflect > 0) tags.push('🪞 ' + T('ab.reflect.n'));
  if (enemy.leech > 0) tags.push('🕸 ' + T('ab.leech.n'));
  if (enemy.enrage > 0) tags.push('😡 ' + T('ab.enrage.n'));
  const weak = (enemy.weak || []).map(t => RES_LABEL[t]).join(' ');
  box.innerHTML = (weak ? '<span class="wk" title="' + T('enemy.weak') + '">' + weak + '</span>' : '') +
    tags.map(t => '<span class="tag">' + t + '</span>').join('');
}

function enemyAttack() {
  if (!enemy || respawning) return;
  const st = stats();
  if (Math.random() < st.dodge) { floatDmg(T('st.dodge'), 'miss'); return; }
  const pierce = 1 - (enemy.pierce || 0);
  const rage = enemy.enrage > 0 ? ABILITY.enrage.mult : 1;
  let dmg = enemy.dmg * rnd(0.9, 1.12) * (1 - st.dmgReduction * pierce) * st.enemyDmgMul * rage;
  dmg = Math.max(1, Math.round(dmg));
  S.hp -= dmg;
  floatDmg('-' + fmt(dmg), 'player');
  SFX('bad');
  /* высасывание: тварь отъедается от нанесённого герою урона */
  if (enemy.leech > 0) {
    const gain = Math.round(dmg * ABILITY.leech.frac);
    enemy.hp = Math.min(enemy.maxHp, enemy.hp + gain);
    floatDmg('+' + fmt(gain), 'magic');
    updateEnemyBar();
  }
  const arena = $('#arena');
  if (arena) { arena.classList.remove('shake'); void arena.offsetWidth; arena.classList.add('shake'); }
  if (S.hp <= 0) playerDeath();
}

function playerDeath() {
  S.deaths++;
  respawning = true;
  const st = stats();
  const lost = Math.floor(S.gold * 0.1);
  S.gold -= lost;
  S.hp = st.maxHp; S.mp = st.maxMp; S.idx = 1;
  logLine('<b style="color:#d84850">' + T('log.died') + '</b>');
  toast('⚰️', T('log.died'), 'blood');
  SFX('death');
  checkAchievements();
  renderAll();
  setTimeout(() => spawnEnemy(), 750);
}

/* ============================== ЗАКЛИНАНИЯ ============================== */
function castSpell(k) {
  if (!enemy || respawning || paused) return;
  const sp = SPELL_BY_K[k];
  const lv = spellLv(k);
  if (!lv) return;
  if ((spellCd[k] || 0) > 0) return;
  const st = stats();
  const kn = knAll()[k];
  /* древо знаний делает школу дешевле и быстрее */
  const cost = Math.max(1, Math.round(sp.cost * (1 - Math.min(0.6, kn.costPct))));
  if (S.mp < cost) { toast('🔷 ' + T('inv.mana'), cost, 'arcane'); return; }

  S.mp -= cost;
  spellCd[k] = sp.cd * (1 - Math.min(0.6, kn.cdPct));
  S.stat.spells++;

  const mult = sp.mult * lv * st.magicPower * (1 + kn.dmgMul);
  /* у каждого заклинания свой вид урона: по голему бей молнией, дракона
     морозь — иначе сопротивление съест половину */
  const type = k === 'fireball' ? DMG_FIRE : k === 'frost' ? DMG_FROST : DMG_BOLT;
  /* пробитие: каждый каст срезает твари сопротивление этой школе */
  if (kn.shred > 0 && enemy.res) {
    enemy.res[type] = Math.max(0.3, (enemy.res[type] || 1) - kn.shred);
  }
  if (sp.slow) { enemy.slow = sp.slow; logLine('<b style="color:#b9a6ff">' + T('sp.' + k + '.n') + '</b>'); }
  const dealt = dealDamage(mult, { magic: true, alwaysCrit: k === 'bolt', heal: st.spellHeal, type,
    crit: kn.crit, critDmg: kn.critDmg });
  /* поджог: доля от фактического урона каста, а не от его кратности */
  if (kn.dotMult > 0 && dealt > 0) applyBurn(type, dealt * kn.dotMult, kn.dotTime || 3);
  /* отголосок: каст бьёт второй раз долей силы. Сопротивление при этом
     уже срезано первым ударом, поэтому эхо всегда чуть злее. */
  if (kn.echo > 0) {
    dealDamage(mult * kn.echo, { magic: true, silent: true, type,
      crit: kn.crit, critDmg: kn.critDmg });
    logLine('✨ ' + T('kt.echo'));
  }
  SFX(k === 'fireball' ? 'fire' : k === 'frost' ? 'frost' : 'bolt');
  checkAchievements();
  renderSpells(); renderHud();
}

/* ============================ ВЫБОР СПОСОБНОСТИ ============================ */
let perkQueue = 0, perkOptions = [];

function rollPerkOptions() {
  const out = [];
  ['phys', 'buff', 'magic'].forEach(cat => {
    const pool = PERKS.filter(p => p.cat === cat);
    out.push(pool[Math.floor(Math.random() * pool.length)]);
  });
  return out;
}
function queuePerkChoice() {
  perkQueue += S.pendingPerks;
  S.pendingPerks = 0;
  if (perkQueue > 0 && !$('#modal').classList.contains('open')) showPerkChoice();
}
function showPerkChoice() {
  if (perkQueue <= 0) return;
  perkOptions = rollPerkOptions();
  const kindName = { phys: 'perk.phys', buff: 'perk.buff', magic: 'perk.magic' };
  let html = '<h2>' + T('perk.title', { n: S.level }) + '</h2><p>' + T('perk.desc') + '</p><div class="perk-cards">';
  perkOptions.forEach((p, i) => {
    const have = S.perks[p.id] || 0;
    html += '<div class="perk-card" data-act="pick-perk" data-i="' + i + '">' +
      '<span class="em">' + p.em + '</span>' +
      '<div class="nm">' + perkName(p.id) + '</div>' +
      '<div class="ds">' + perkDesc(p.id) + '</div>' +
      '<div class="cat">' + T(kindName[p.cat]) + (have ? ' · ' + T('perk.have') + ' ' + have : '') + '</div></div>';
  });
  html += '</div><p class="perk-left">' + T('perk.left') + ' ' + perkQueue + '</p>';
  openModal(html, 'perk-wrap');
}
function pickPerk(i) {
  const p = perkOptions[i]; if (!p) return;
  S.perks[p.id] = (S.perks[p.id] || 0) + 1;
  S.stat.perks++;
  if (p.spell) S.spells[p.spell] = (S.spells[p.spell] || 0) + 1;
  perkQueue--;
  const st = stats();
  S.hp = Math.min(st.maxHp, S.hp); S.mp = Math.min(st.maxMp, S.mp);
  logLine('<b style="color:#cfcfd6">' + p.em + ' ' + perkName(p.id) + '</b>');
  SFX('level');
  checkAchievements();
  closeModal(true);
  renderAll();
  if (perkQueue > 0) setTimeout(showPerkChoice, 250);
}

/* ============================== МОДАЛЬНЫЕ ОКНА ============================== */
let modalLocked = false;
function openModal(html, cls) {
  const m = $('#modal');
  m.innerHTML = '<div class="modal-box' + (cls ? ' ' + cls : '') + '">' + html + '</div>';
  m.classList.add('open');
  updatePause();
}
function closeModal(force) {
  if (modalLocked && !force) return;
  modalLocked = false;
  $('#modal').classList.remove('open');
  $('#modal').innerHTML = '';
  updatePause();
}

/* ============================== ПАУЗА ============================== */
/* Бой замирает, пока игрок в инвентаре, лавке, настройках или в окне
   выбора способности. Иначе тварь добивает героя, пока тот надевает
   предмет или копит золото, и это несправедливо.
   Ждём закрытия ОКНА ВЫБОРА СПОСОБНОСТИ: оно может открыться уже поверх
   страницы, и герой не должен умереть под ним.
   Главное меню намеренно не в списке: там бой ещё не начат. */
let paused = false;

function inMenuScreen() { const m = $('#mainmenu'); return !!m && m.classList.contains('open'); }

function pausedNow() {
  if (!S || inMenuScreen()) return false;
  if (curPage) return true;
  if ($('#modal').classList.contains('open')) return true;
  const s = $('#settings');
  return !!s && s.classList.contains('open');
}

/* Пауза вычисляется сразу при каждом открытии и закрытии окна, а не только
   в игровом цикле: цикл может пропускать кадры из-за ограничения частоты,
   и тогда бой оставался бы на паузе после выхода из инвентаря. */
function updatePause() {
  paused = pausedNow();
  renderPause();
}

function renderPause() {
  const on = paused || pausedNow();
  const badge = $('#pause-badge');
  if (badge) badge.classList.toggle('on', !!on);
  const arena = $('#arena');
  if (arena) arena.classList.toggle('paused', !!on);
}

/* ================================ РЕНДЕР ================================ */
const tabDots = new Set();
function markTab(t) { tabDots.add(t); renderTabs(); }
function renderTabs() {
  $$('#nav .nav-btn').forEach(b => {
    const k = b.dataset.page;
    let d = b.querySelector('.dot');
    if (tabDots.has(k) && !b.classList.contains('active')) {
      if (!d) { d = document.createElement('span'); d.className = 'dot'; b.appendChild(d); }
    } else if (d) d.remove();
  });
}

let curPage = null;
const PAGE_NAMES = { hero: 1, inv: 1, kn: 1, up: 1, shop: 1, ach: 1 };

function openPage(p) {
  if (!PAGE_NAMES[p]) return;
  curPage = p;
  tabDots.delete(p);
  $$('#pages .page').forEach(el => el.classList.toggle('active', el.dataset.page === p));
  $$('#nav .nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === p));
  renderPanels(); renderTabs();
  updatePause();
  SFX('click');
}
function closePage() {
  curPage = null;
  $$('#pages .page').forEach(el => el.classList.remove('active'));
  $$('#nav .nav-btn').forEach(b => b.classList.remove('active'));
  updatePause();
  SFX('click');
}

/* ------------------------- полоса: значение + текст ------------------------- */
function setBar(fillId, textId, val, max, fmtVal) {
  const fill = $('#' + fillId), txt = $('#' + textId);
  if (fill) fill.style.width = clamp(max ? val / max : 0, 0, 1) * 100 + '%';
  if (txt) txt.textContent = (fmtVal ? fmt(val) + ' / ' + fmt(max) : fmt(val));
}

function renderHud() {
  const st = stats();
  if (S.hp === null || S.hp === undefined) S.hp = st.maxHp;
  if (S.mp === null || S.mp === undefined) S.mp = st.maxMp;
  S.hp = clamp(S.hp, 0, st.maxHp); S.mp = clamp(S.mp, 0, st.maxMp);

  setBar('hero-hp-fill', 'hero-hp-text', S.hp, st.maxHp, true);
  setBar('hero-mp-fill', 'hero-mp-text', Math.floor(S.mp), st.maxMp, true);
  setBar('hero-xp-fill', 'hero-xp-text', S.xp, xpNeed(S.level), true);

  /* подписи и иконки полос: как в драк-фэнтези HUD */
  const hpBar = $('#bar-hp'), mpBar = $('#bar-mp'), xpBar = $('#bar-xp');
  if (hpBar) hpBar.dataset.label = '❤ ' + T('bar.hp');
  if (mpBar) mpBar.dataset.label = '◆ ' + T('bar.mp');
  if (xpBar) xpBar.dataset.label = '✦ ' + T('bar.xp');

  const g = $('#res-gold'), k = $('#res-kills'), z = $('#res-zone'), kp = $('#res-kp');
  if (g) g.textContent = fmt(S.gold);
  if (k) k.textContent = fmt(S.kills);
  if (z) z.textContent = (locIdx() + 1) + (S.cycle ? '.' + S.cycle : '');
  if (kp) kp.textContent = fmt(S.kp || 0);
}

function renderEnemy() {
  if (!enemy) return;
  const L = loc();
  $('#zone-name').textContent = locName(L.k);
  $('#zone-sub').textContent = locSub(L.k) + ' · ' + (enemy.boss ? T('zone.boss')
    : T('zone.monster') + ' ' + S.idx + ' / ' + MONSTERS_PER_LOC) + (S.cycle ? ' · ' + T('zone.cycle') + ' ' + (S.cycle + 1) : '');
  const nx = nextLoc(L.k);
  $('#zone-hint').textContent = enemy.boss ? T('zone.bossHere')
    : T('zone.bossAhead') + ' ' + Math.max(0, MONSTERS_PER_LOC - S.idx) + (nx ? ' · ' + T('zone.next') + ' ' + locName(nx) : ' · ' + T('zone.end'));

  const sc = $('#scene');
  if (sc && sc.dataset.key !== L.k) {
    sc.dataset.key = L.k;
    /* у первоначального пейзажа своя графика и градиенты в defs;
       фильтр дрожания сюда не вешаем — ссылка на необъявленный фильтр
       заставила бы браузер не рисовать сцену целиком */
    sc.innerHTML = '<svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg">' +
      window.SCENES.render(L.scene || L.k) + '</svg>';
  }

  const art = $('#enemy-art');
  if (art) {
    const r = enemy.art.fn(L.pal);
    /* качество деталей из настроек влияет на объём рисуемых слоёв */
    art.dataset.q = SET.quality;
    /* область показа подгоняем под реальные границы рисунка: у каждой твари
       она своя, иначе арт обрезается или висит в пустом квадрате */
    const b = r.box || { x: 0, y: 0, w: 200, h: 200 };
    /* размер твари: мелкая мышь не должна быть ростом с дракона, хотя кадр
       у всех растягивается в один и тот же квадрат. Масштаб задаём через
       --k, чтобы не трогать раскладку сцены */
    art.style.setProperty('--k', String(r.size || 1));
    /* у старого стиля своя анимация в defs; фильтр дрожания сюда не вешаем —
       ссылка на несуществующий фильтр заставила бы браузер не рисовать тварь */
    art.innerHTML = '<svg viewBox="' + b.x + ' ' + b.y + ' ' + b.w + ' ' + b.h +
      '" xmlns="http://www.w3.org/2000/svg">' + (r.defs || '') + r.body + '</svg>';
    art.classList.toggle('boss-aura', !!enemy.boss);
  }
  $('#enemy-name').textContent = enemy.name;
  updateEnemyBar();
}

function updateEnemyBar() {
  if (!enemy) return;
  const fill = $('#enemy-hp-fill'), txt = $('#enemy-hp-text');
  if (fill) fill.style.width = clamp(enemy.hp / enemy.maxHp, 0, 1) * 100 + '%';
  if (txt) txt.textContent = fmt(Math.max(0, enemy.hp)) + ' / ' + fmt(enemy.maxHp);
}

function renderSpells() {
  let html = '';
  SPELLS.forEach(sp => {
    const lv = spellLv(sp.k);
    const cd = spellCd[sp.k] || 0;
    const noMana = S.mp < sp.cost;
    const cls = !lv ? 'locked' : (cd > 0 ? 'cool' : (noMana ? 'locked' : 'ready'));
    const p = sp.cd > 0 ? (cd / sp.cd) * 100 : 0;
    html += '<div class="spell ' + cls + '" data-act="cast" data-k="' + sp.k + '" title="' + T('sp.' + sp.k + '.n') + '">' +
      '<span class="em">' + sp.em + '</span>' +
      '<span class="nm">' + T('sp.' + sp.k + '.n') + '</span>' +
      '<span class="cost">' + sp.cost + '◆' + (lv > 1 ? ' · ' + lv : '') + '</span>' +
      '<span class="cd" style="height:' + p + '%"></span></div>';
  });
  $('#spell-bar').innerHTML = html;
}

function renderAll() {
  renderHud(); renderEnemy(); renderSpells();
  if (curPage) renderPanels();
  renderTabs();
}
function renderPanels() {
  if (!curPage) return;
  if (curPage === 'hero') renderHero();
  if (curPage === 'kn') renderKn();
  if (curPage === 'inv') renderInv();
  if (curPage === 'up') renderUp();
  if (curPage === 'shop') renderShop();
  if (curPage === 'ach') renderAch();
}
function pageBody(p) { return $('[data-body="' + p + '"]'); }
/* полоса в стиле HUD — используется на всех страницах */
function barRow(label, val, max, cls, text) {
  const p = clamp(max ? val / max : 0, 0, 1) * 100;
  return '<div class="stat-bar"><div class="sb-label">' + label + '</div>' +
    '<div class="bar mini ' + (cls || '') + '"><i style="width:' + p.toFixed(1) + '%"></i>' +
    '<span>' + (text !== undefined ? text : fmt(val) + ' / ' + fmt(max)) + '</span></div></div>';
}
function statRow(l, v) { return '<div class="stat"><span>' + l + '</span><b>' + v + '</b></div>'; }
function itemArt(it, size) { return window.ITEMART.svg(it, rarOf(it.rar).col, size, SET.quality); }

/* ------------------------------ СТАТИСТИКА ------------------------------ */
function renderHero() {
  const st = stats();
  const L = loc();
  let html = '';

  /* полосы — те же, что в HUD */
  html += '<div class="card bars-card">' +
    '<h3>' + T('inv.stats') + '</h3>' +
    barRow('❤ ' + T('bar.hp'), S.hp, st.maxHp, 'hero') +
    barRow('◆ ' + T('bar.mp'), Math.floor(S.mp), st.maxMp, 'mana') +
    barRow('✦ ' + T('bar.xp'), S.xp, xpNeed(S.level), 'xp') +
    '</div>';

  html += '<div class="card"><h3>' + T('inv.stats') + '</h3><div class="stat-grid">' +
    statRow('⭐ ' + T('st.level'), S.level) +
    statRow('⚔️ ' + T('st.dmg'), fmt(st.atk)) +
    statRow('❤️ ' + T('st.hp'), fmt(st.maxHp)) +
    statRow('◆ ' + T('st.mp'), fmt(st.maxMp)) +
    statRow('🎯 ' + T('st.crit'), pct(st.crit)) +
    statRow('💥 ' + T('st.critDmg'), '×' + st.critDmg.toFixed(2)) +
    statRow('💨 ' + T('st.dodge'), pct(st.dodge)) +
    statRow('🛡️ ' + T('st.armor'), fmt(st.armor) + ' · ' + pct(st.dmgReduction, 0)) +
    statRow('🩸 ' + T('st.lifesteal'), pct(st.lifesteal)) +
    statRow('💚 ' + T('st.regen'), fmt(st.regen) + '/с') +
    statRow('✨ ' + T('st.magic'), '×' + st.magicPower.toFixed(2)) +
    statRow('⚡ ' + T('st.atkSpeed'), (1 / st.atkInterval).toFixed(2) + '/с') +
    statRow('🌀 ' + T('st.double'), pct(st.doubleStrike, 0)) +
    statRow('◆ ' + T('st.manaRegen'), st.manaRegen.toFixed(1) + '/с') +
    '</div></div>';

  html += '<div class="card"><h3>' + T('inv.path') + '</h3><div class="stat-grid">' +
    statRow('⚑ ' + T('st.loc'), locName(L.k)) +
    statRow('🗺️ ' + T('st.path'), (locIdx() + 1) + ' / ' + LOCATIONS.length) +
    statRow('🏁 ' + T('st.cleared'), Object.keys(S.cleared).length + ' / ' + LOCATIONS.length) +
    statRow('🌀 ' + T('st.cycle'), S.cycle + 1) +
    statRow('☠️ ' + T('st.kills'), fmt(S.kills)) +
    statRow('⚰️ ' + T('st.deaths'), S.deaths) +
    statRow('💥 ' + T('st.bestHit'), fmt(S.stat.best)) +
    statRow('🎴 ' + T('st.perks'), S.stat.perks) +
    '</div></div>';

  pageBody('hero').innerHTML = html;
}

/* ------------------------------ ИНВЕНТАРЬ ------------------------------ */
let selId = null, selEq = null;

function renderInv() {
  const st = stats();
  let html = '';

  /* полосы, как везде */
  html += '<div class="card bars-card">' +
    barRow('❤ ' + T('bar.hp'), S.hp, st.maxHp, 'hero') +
    barRow('◆ ' + T('bar.mp'), Math.floor(S.mp), st.maxMp, 'mana') +
    barRow('✦ ' + T('bar.xp'), S.xp, xpNeed(S.level), 'xp') +
    '</div>';

  /* расходники */
  html += '<div class="card"><h3>' + T('inv.consum') + '</h3>' +
    '<div class="row between" style="margin-bottom:8px"><span class="hint">🧪 ' + T('inv.potions') + ': ' + S.potions + ' ' + T('inv.potionHeal') + '</span>' +
    '<button class="btn small" data-act="potion"' + (S.potions <= 0 || S.hp >= st.maxHp ? ' disabled' : '') + '>' + T('inv.drink') + '</button></div>' +
    '<div class="row between"><span class="hint">🔷 ' + T('inv.mpotions') + ': ' + S.mpotions + ' ' + T('inv.mpotionHeal') + '</span>' +
    '<button class="btn small" data-act="mpotion"' + (S.mpotions <= 0 || S.mp >= st.maxMp ? ' disabled' : '') + '>' + T('inv.drink') + '</button></div></div>';

  /* сундуки */
  if (S.chests.length) {
    html += '<div class="card"><h3>' + T('inv.chests') + ' (' + S.chests.length + ')</h3>';
    S.chests.forEach(c => {
      html += '<div class="chest"><div class="em">' + c.em + '</div><div class="grow">' +
        '<div class="nm">' + c.name + '</div>' +
        '<div class="ds">' + c.items.length + ' · ' + fmt(c.gold) + '◉' +
        (c.potions ? ' · 🧪' + c.potions : '') + (c.mpotions ? ' · 🔷' + c.mpotions : '') + '</div>' +
        '<div class="loot-row">' + c.items.map(it =>
          '<span class="loot-chip ' + rarOf(it.rar).b + '">' + itemArt(it, 26) + '<b class="' + rarOf(it.rar).cls + '">' + it.name + '</b></span>').join('') + '</div>' +
        '</div><button class="btn small gold" data-act="open-chest" data-id="' + c.id + '">' + T('inv.open') + '</button></div>';
    });
    if (S.chests.length > 1) html += '<button class="btn small full" data-act="open-all" style="margin-top:8px">' + T('inv.openAll') + '</button>';
    html += '</div>';
  }

  /* снаряжение */
  html += '<div class="card"><h3>' + T('inv.gear') + '</h3><div class="slot-grid">';
  SLOTS.forEach(sl => {
    const it = S.eq[sl.k];
    html += '<div class="slot ' + (it ? rarOf(it.rar).b : 'empty') + (selEq === sl.k ? ' sel' : '') + '" data-act="select-eq" data-k="' + sl.k + '">' +
      '<div class="slot-art">' + (it ? itemArt(it, 54) : '<span class="ph">' + sl.em + '</span>') + '</div>' +
      '<div class="lbl">' + sl.em + ' ' + slotName(sl.k) + '</div>' +
      (it ? '<div class="nm ' + rarOf(it.rar).cls + '">' + it.name + '</div><div class="af">' + T('up.lvl') + ' ' + it.ilvl + ' · ' + fmt(it.score) + '</div>'
        : '<div class="nm">' + T('inv.emptySlot') + '</div>') +
      '</div>';
  });
  html += '</div>';

  const eq = selEq ? S.eq[selEq] : null;
  if (eq) {
    const rr = rarOf(eq.rar);
    html += '<div class="item-detail ' + rr.b + '"><div class="detail-art">' + itemArt(eq, 96) + '</div>' +
      '<div class="detail-txt"><div class="hd ' + rr.cls + '">' + eq.name + '</div>' +
      '<div class="sub">' + rarName(eq.rar) + ' · ' + slotName(eq.slot) + ' · ' + T('up.lvl') + ' ' + eq.ilvl + '</div>' +
      '<div class="af">' + eq.affixes.map(affixText).join('<br>') + '</div>' +
      '<div class="sub" style="margin-top:8px">' + T('inv.power') + ': ' + fmt(eq.score) + '</div>' +
      '<div class="acts"><button class="btn small" data-act="unequip" data-k="' + eq.slot + '">' + T('inv.sell') + ' ✕ 0</button></div></div></div>';
  }
  html += '</div>';

  /* сумка */
  html += '<div class="card"><h3>' + T('inv.bag') + ' (' + S.inv.length + '/' + BAG_SIZE + ')</h3><div class="bag-grid">';
  for (let i = 0; i < BAG_SIZE; i++) {
    const it = S.inv[i];
    if (!it) html += '<div class="cell empty"></div>';
    else html += '<div class="cell ' + (selId === it.id ? 'sel ' : '') + rarOf(it.rar).b + '" data-act="select" data-id="' + it.id + '">' +
      itemArt(it, 44) + '<span class="lvtag">' + it.ilvl + '</span></div>';
  }
  html += '</div>';

  const sel = S.inv.find(x => x.id === selId);
  if (sel) {
    const rr = rarOf(sel.rar);
    html += '<div class="item-detail ' + rr.b + '"><div class="detail-art">' + itemArt(sel, 96) + '</div>' +
      '<div class="detail-txt"><div class="hd ' + rr.cls + '">' + sel.name + '</div>' +
      '<div class="sub">' + rarName(sel.rar) + ' · ' + slotName(sel.slot) + ' · ' + T('up.lvl') + ' ' + sel.ilvl + '</div>' +
      '<div class="af">' + sel.affixes.map(affixText).join('<br>') + '</div>' +
      '<div class="sub" style="margin-top:8px">' + T('inv.power') + ': ' + fmt(sel.score) + '</div>' +
      '<div class="acts">' +
      '<button class="btn small" data-act="equip" data-id="' + sel.id + '">' + T('inv.equip') + '</button>' +
      '<button class="btn small blood" data-act="sell" data-id="' + sel.id + '">' + T('inv.sell') + ' ' + fmt(sellValue(sel)) + '◉</button>' +
      '</div></div></div>';
  }

  if (S.inv.length) {
    html += '<div class="row" style="margin-top:9px;gap:6px;flex-wrap:wrap">' +
      '<button class="btn small" data-act="equip-best">' + T('inv.equipBest') + '</button>' +
      '<button class="btn small blood" data-act="sell-common">' + T('inv.sellCommon') + '</button>' +
      '<button class="btn small blood" data-act="sell-all">' + T('inv.sellAll') + '</button></div>';
  } else {
    html += '<div class="empty" style="margin-top:10px">' + T('inv.empty') + '</div>';
  }
  html += '</div>';

  /* способности */
  const cats = { phys: 'ac.phys', buff: 'ac.buff', magic: 'ac.magic' };
  html += '<div class="card"><h3>' + T('inv.perks') + ' · ' + T('inv.perkTotal') + ' ' + S.stat.perks + '</h3>';
  if (perkQueue > 0) {
    html += '<button class="btn gold full" data-act="choose-perk" style="margin-bottom:9px">' + T('inv.pickPerk') + ' (' + perkQueue + ')</button>';
  }
  let anyPerk = false;
  Object.keys(cats).forEach(c => {
    const owned = PERKS.filter(p => p.cat === c && (S.perks[p.id] || 0) > 0);
    if (!owned.length) return;
    anyPerk = true;
    html += '<div class="hint sect">' + T(cats[c]) + '</div>';
    owned.forEach(p => {
      html += '<div class="upg"><div class="em">' + p.em + '</div><div class="grow">' +
        '<div class="nm">' + perkName(p.id) + '</div><div class="ds">' + perkDesc(p.id) + '</div></div>' +
        '<div class="now">×' + S.perks[p.id] + '</div></div>';
    });
  });
  if (!anyPerk) html += '<div class="empty">' + T('inv.noPerks') + '</div>';
  html += '</div>';

  /* заклинания */
  html += '<div class="card"><h3>' + T('inv.spells') + '</h3>';
  SPELLS.forEach(sp => {
    const lv = spellLv(sp.k);
    html += '<div class="upg' + (lv ? '' : ' dim') + '"><div class="em">' + sp.em + '</div><div class="grow">' +
      '<div class="nm">' + T('sp.' + sp.k + '.n') + '</div>' +
      '<div class="ds">' + T('sp.' + sp.k + '.d') + '</div></div>' +
      '<div class="now">' + (lv ? T('inv.level') + ' ' + lv + ' · ' + sp.cost + '◆' : T('inv.spellLocked')) + '</div></div>';
  });
  html += '</div>';

  pageBody('inv').innerHTML = html;
}

/* ------------------------------ ДРЕВО ЗНАНИЙ ------------------------------ */
function renderKn() {
  const K = window.KNOWLEDGE;
  let html = '<div class="card"><h3>📖 ' + T('kn.title') + ' · ' + T('kn.points') + ': <b>' + fmt(S.kp) + '</b></h3>' +
    '<p class="hint">' + T('kn.hint') + '</p><div class="kt-tree">';

  K.BRANCHES.forEach(b => {
    const n = knLv(b);
    const full = n >= K.MAX;
    html += '<div class="kt-branch" data-branch="' + b + '">' +
      '<div class="kt-head"><span class="kt-em">' + SPELL_BY_K[b].em + '</span>' +
      '<span class="kt-name">' + T('sp.' + b + '.n') + '</span>' +
      '<span class="kt-count' + (full ? ' full' : '') + '">' + n + ' / ' + K.MAX + '</span></div>';
    html += '<div class="kt-nodes">';
    for (let i = 0; i < K.MAX; i++) {
      const done = i < n, next = i === n, can = K.canBuy(S, b, i);
      const cls = 'kt-node' + (done ? ' done' : '') + (next ? ' next' : '') + (can ? ' can' : '');
      const val = knDesc(b, i);
      html += '<div class="' + cls + '" data-act="kn-buy" data-b="' + b + '" data-i="' + i + '"' +
        ' title="' + knName(b, i) + ' — ' + val + '">' +
        '<span class="kt-dot">' + (done ? '✓' : (can ? K.cost(i) : '🔒')) + '</span>' +
        '<div class="kt-body"><div class="kt-title">' + knName(b, i) + '</div>' +
        '<div class="kt-val">' + val + '</div></div>' +
        (done ? '' : '<span class="kt-price">' + K.cost(i) + '📖</span>') +
        '</div>';
    }
    html += '</div></div>';
  });
  html += '</div></div>';
  pageBody('kn').innerHTML = html;
}

/* ------------------------------ УЛУЧШЕНИЯ ------------------------------ */
function renderUp() {
  const st = stats();
  let html = '<div class="card"><h3>🔨 ' + T('up.forge') + ' · ' + T('up.gold') + ': ' + fmt(S.gold) + '◉</h3>' +
    '<p class="hint">' + T('up.desc') + '</p>';
  UPGRADES.forEach(u => {
    const c = upgCost(u), lv = S.upg[u.k] || 0;
    const can = S.gold >= c;
    let nowTxt = '';
    if (u.k === 'dmg') nowTxt = T('up.dmg.now', { v: (6 * lv) });
    if (u.k === 'agi') nowTxt = T('up.agi.now', { v: pct(0.012 * lv) });
    if (u.k === 'crit') nowTxt = T('up.crit.now', { v: (1.5 + 0.03 * lv).toFixed(2) });
    html += '<div class="upg"><div class="em">' + u.em + '</div><div class="grow">' +
      '<div class="nm">' + T('up.' + u.k + '.n') + ' · ' + T('up.lvl') + ' ' + lv + '</div>' +
      '<div class="ds">' + T('up.' + u.k + '.d') + '</div>' +
      '<div class="now" style="margin-top:3px">' + nowTxt + '</div></div>' +
      '<button class="btn small' + (can ? ' gold' : '') + '" data-act="upg" data-k="' + u.k + '"' + (can ? '' : ' disabled') + '>' + fmt(c) + '◉</button></div>';
  });
  html += '</div>';
  pageBody('up').innerHTML = html;
}

/* ------------------------------ ЛАВКА ------------------------------ */
function genShop() {
  const out = [];
  const ilvl = lootIlvl();
  for (let i = 0; i < 4; i++) {
    const it = rollItem(ilvl + irnd(0, 4), i < 2 ? rollRarity(0.4) : null);
    out.push({ t: 'item', it, price: Math.round(sellValue(it) * rnd(1.6, 2.4)) });
  }
  out.push({ t: 'potion', price: Math.round(28 * (1 + S.level * 0.12)), n: 1 });
  out.push({ t: 'mpotion', price: Math.round(34 * (1 + S.level * 0.12)), n: 1 });
  return out;
}
function renderShop() {
  if (!S.shopStock.length) S.shopStock = genShop();
  let html = '<div class="card"><h3>🏪 ' + T('shop.title') + ' · ' + fmt(S.gold) + '◉</h3>' +
    '<p class="hint">' + T('shop.desc') + '</p>';
  S.shopStock.forEach((e, i) => {
    const can = S.gold >= e.price;
    if (e.t === 'item') {
      const rr = rarOf(e.it.rar);
      html += '<div class="shop-item ' + rr.b + '">' +
        '<div class="shop-art">' + itemArt(e.it, 62) + '</div>' +
        '<div class="grow"><div class="nm ' + rr.cls + '">' + e.it.name + '</div>' +
        '<div class="ds">' + rarName(e.it.rar) + ' · ' + slotName(e.it.slot) + ' · ' + T('up.lvl') + ' ' + e.it.ilvl + '</div>' +
        '<div class="af">' + e.it.affixes.map(affixText).join('<br>') + '</div></div>' +
        '<button class="btn small' + (can ? ' gold' : '') + '" data-act="buy" data-i="' + i + '"' + (can ? '' : ' disabled') + '>' + fmt(e.price) + '◉</button></div>';
    } else {
      const em = e.t === 'potion' ? '🧪' : '🔷';
      const nm = e.t === 'potion' ? T('inv.potions') : T('inv.mpotions');
      html += '<div class="shop-item"><div class="shop-art ph">' + em + '</div>' +
        '<div class="grow"><div class="nm">' + nm + '</div><div class="ds">×' + e.n + '</div></div>' +
        '<button class="btn small' + (can ? ' gold' : '') + '" data-act="buy" data-i="' + i + '"' + (can ? '' : ' disabled') + '>' + fmt(e.price) + '◉</button></div>';
    }
  });
  html += '<button class="btn small full" data-act="shop-refresh" style="margin-top:9px">🔄 ' + T('shop.refresh') + ' · 60◉</button></div>';
  pageBody('shop').innerHTML = html;
}

/* ------------------------------ СВЕРШЕНИЯ ------------------------------ */
function renderAch() {
  const done = ACHIEVEMENTS.filter(a => S.ach[a.k]).length;
  let html = '<div class="card"><h3>🏆 ' + T('ach.title') + ' · ' + done + ' / ' + ACHIEVEMENTS.length + '</h3>' +
    barRow('', done, ACHIEVEMENTS.length, 'xp', done + ' / ' + ACHIEVEMENTS.length);
  ACHIEVEMENTS.forEach((a, i) => {
    const on = !!S.ach[a.k];
    html += '<div class="ach' + (on ? ' on' : '') + '"><span class="em">' + (on ? a.em : '🔒') + '</span>' +
      '<div class="grow"><div class="nm">' + window.I18N.achName(i) + '</div>' +
      '<div class="ds">' + window.I18N.achDesc(i) + '</div></div></div>';
  });
  html += '</div>';
  pageBody('ach').innerHTML = html;
}

function checkAchievements() {
  ACHIEVEMENTS.forEach((a, i) => {
    if (S.ach[a.k]) return;
    try {
      if (a.chk(S)) {
        S.ach[a.k] = 1;
        toast(a.em + ' ' + T('achievement'), window.I18N.achName(i), 'gold');
        SFX('victory');
        logLine('<b style="color:#cfcfd6">🏆 ' + window.I18N.achName(i) + '</b>');
      }
    } catch (e) { /* пропускаем сломанное условие */ }
  });
}

/* ================================ ДЕЙСТВИЯ ================================ */
function buyUpgrade(k) {
  const u = UPGRADES.find(x => x.k === k); if (!u) return;
  const c = upgCost(u);
  if (S.gold < c) return;
  S.gold -= c; S.upg[k] = (S.upg[k] || 0) + 1; S.stat.upgrades++;
  SFX('coin'); checkAchievements(); renderAll();
}
function equipItem(id) {
  const i = S.inv.findIndex(x => x.id === id); if (i < 0) return;
  const it = S.inv[i], old = S.eq[it.slot];
  S.eq[it.slot] = it; S.inv.splice(i, 1);
  if (old) S.inv.push(old);
  selId = null; selEq = it.slot; SFX('hit'); renderAll();
  logLine(T('inv.equip') + ': <b class="' + rarOf(it.rar).cls + '">' + it.name + '</b>');
}
function unequipSlot(k) {
  const it = S.eq[k]; if (!it) return;
  if (S.inv.length >= BAG_SIZE) { toast('🎒', T('log.bagFull'), 'blood'); return; }
  S.eq[k] = null; S.inv.push(it); selEq = null; renderAll();
}
function sellItem(id) {
  const i = S.inv.findIndex(x => x.id === id); if (i < 0) return;
  S.gold += sellValue(S.inv[i]); S.inv.splice(i, 1); selId = null; SFX('coin'); renderAll();
}
function buyStock(i) {
  const e = S.shopStock[i]; if (!e || S.gold < e.price) return;
  if (e.t === 'item') {
    if (S.inv.length >= BAG_SIZE) { toast('🎒', T('log.bagFull'), 'blood'); return; }
    S.gold -= e.price; S.inv.push(e.it);
    logLine(T('shop.buy') + ': <b class="' + rarOf(e.it.rar).cls + '">' + e.it.name + '</b>');
  } else {
    S.gold -= e.price;
    if (e.t === 'potion') S.potions++; else S.mpotions++;
  }
  S.shopStock.splice(i, 1); SFX('coin'); renderAll();
}

const ACTIONS = {
  upg: el => buyUpgrade(el.dataset.k),
  'kn-buy': el => buyNode(el.dataset.b, Number(el.dataset.i)),
  potion: () => {
    if (S.potions <= 0) return;
    const st = stats(); S.potions--;
    S.hp = Math.min(st.maxHp, S.hp + st.maxHp * 0.6);
    floatDmg('+' + fmt(st.maxHp * 0.6), 'heal'); SFX('loot'); renderAll();
  },
  mpotion: () => {
    if (S.mpotions <= 0) return;
    const st = stats(); S.mpotions--;
    S.mp = Math.min(st.maxMp, S.mp + st.maxMp * 0.5);
    floatDmg('+' + fmt(st.maxMp * 0.5), 'magic'); SFX('loot'); renderAll();
  },
  cast: el => castSpell(el.dataset.k),
  'pick-perk': el => pickPerk(Number(el.dataset.i)),
  'choose-perk': () => showPerkChoice(),
  select: el => { selId = Number(el.dataset.id); selEq = null; renderInv(); },
  'select-eq': el => { selEq = el.dataset.k; selId = null; renderInv(); },
  equip: el => equipItem(Number(el.dataset.id)),
  unequip: el => unequipSlot(el.dataset.k),
  sell: el => sellItem(Number(el.dataset.id)),
  'open-chest': el => openChest(Number(el.dataset.id)),
  'open-all': () => openAllChests(),
  'page': el => { const p = el.dataset.page; curPage === p ? closePage() : openPage(p); },
  'page-close': () => closePage(),
  'equip-best': () => {
    SLOTS.forEach(sl => {
      const cand = S.inv.filter(x => x.slot === sl.k).sort((a, b) => b.score - a.score)[0];
      if (!cand) return;
      const cur = S.eq[sl.k];
      if (!cur || cand.score > cur.score) equipItem(cand.id);
    });
  },
  'sell-common': () => {
    let g = 0;
    S.inv = S.inv.filter(it => { if (it.rar === 'common') { g += sellValue(it); return false; } return true; });
    S.gold += g; toast('💰', '+' + fmt(g) + ' ' + T('toast.gold'), 'gold'); SFX('coin'); renderAll();
  },
  'sell-all': () => {
    let g = 0; S.inv.forEach(it => g += sellValue(it)); S.inv = []; S.gold += g; selId = null;
    toast('💰', '+' + fmt(g) + ' ' + T('toast.gold'), 'gold'); SFX('coin'); renderAll();
  },
  buy: el => buyStock(Number(el.dataset.i)),
  'shop-refresh': () => {
    if (S.gold < 60) return;
    S.gold -= 60; S.shopStock = genShop(); SFX('coin'); renderAll();
  },
  'save-now': () => { save(); toast('💾', T('toast.saved')); closeModal(true); },
  'settings-close': () => closeSettings(),
  'close-modal': () => closeModal(),
  'hard-reset': () => openModal('<h2>⚠️ ' + T('modal.erase') + '</h2><p>' + T('modal.eraseText') + '</p>' +
    '<div class="acts"><button class="btn blood" data-act="hard-reset-confirm">' + T('modal.eraseYes') + '</button>' +
    '<button class="btn" data-act="close-modal">' + T('modal.cancel') + '</button></div>'),
  'hard-reset-confirm': () => {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* нет хранилища */ }
    S = freshState(); S.hp = stats().maxHp; S.mp = stats().maxMp;
    selId = null; selEq = null; perkQueue = 0;
    closeModal(true); spawnEnemy(); renderAll();
    toast('🌀', T('toast.restart') + ' · ' + T('toast.luck'));
  },
  /* главное меню */
  'menu-play': () => startGame(),
  'menu-new': () => {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* нет хранилища */ }
    startGame();
    toast('🌀', T('toast.restart') + ' · ' + T('toast.luck'));
  },
  'menu-settings': () => openSettings(),
  'menu-credits': () => openModal('<h2>' + T('credits.title') + '</h2><p>' + T('credits.text') + '</p>' +
    '<div class="acts"><button class="btn" data-act="close-modal">' + T('set.close') + '</button></div>')
};

function handleAction(name, el) {
  const fn = ACTIONS[name];
  if (!fn) return false;
  if (name === 'close-modal' && modalLocked) return true;
  fn(el);
  if (name !== 'select' && name !== 'select-eq') save();
  return true;
}

/* ============================== МЕНЮ И НАСТРОЙКИ ============================== */
function startGame() {
  window.AUDIO.unlock();
  if (!S) { S = load() || freshState(); }
  $('#mainmenu').classList.remove('open');
  $('#app').classList.add('on');
  updatePause();
  SET.started = true; saveSettings();
  if (!S.hp) { const st = stats(); S.hp = st.maxHp; S.mp = st.maxMp; }
  window.AUDIO.musicStart(locIdx());
  bgLoc = locIdx(); bgMix = 1;
  spawnEnemy();
  renderAll();
  save();
}

function openMenu() {
  if (!S) return;
  const play = Math.floor((now() - S.startTs) / 1000);
  const h = Math.floor(play / 3600), m = Math.floor(play % 3600 / 60);
  openModal('<h2>☰ ' + T('menu.settings').replace(/.*/, '☰') + '</h2>' +
    '<div class="kv"><span>⏳</span><b>' + h + 'ч ' + m + 'м</b></div>' +
    '<div class="kv"><span>☠️ ' + T('st.kills') + '</span><b>' + fmt(S.kills) + '</b></div>' +
    '<div class="kv"><span>⚑ ' + T('st.loc') + '</span><b>' + locName(S.locKey) + '</b></div>' +
    '<div class="kv"><span>🏆 ' + T('ach.title') + '</span><b>' + ACHIEVEMENTS.filter(a => S.ach[a.k]).length + ' / ' + ACHIEVEMENTS.length + '</b></div>' +
    '<div class="acts"><button class="btn" data-act="save-now">💾 ' + T('menu.save') + '</button>' +
    '<button class="btn" data-act="menu-settings">⚙ ' + T('menu.settings') + '</button>' +
    '<button class="btn" data-act="hard-reset">🗑 ' + T('set.reset') + '</button>' +
    '<button class="btn" data-act="close-modal">' + T('set.close') + '</button></div>');
}

function langButtons(containerId) {
  const box = $('#' + containerId);
  if (!box) return;
  box.innerHTML = window.I18N.LANGS.map(l =>
    '<button class="lang-btn' + (l.k === SET.lang ? ' on' : '') + '" data-lang="' + l.k + '">' +
    l.flag + ' ' + l.n + '</button>').join('');
}

function openSettings() {
  $('#settings').classList.add('open');
  syncSettingsUI();
  langButtons('lang-list');
  updatePause();
  SFX('click');
}
function closeSettings() {
  $('#settings').classList.remove('open');
  updatePause();
  SFX('click');
}
function syncSettingsUI() {
  const f = $('#set-fps'); if (f) f.checked = !!SET.showFps;
  const l = $('#set-limit'); if (l) l.value = String(SET.frameLimit);
  const q = $('#set-quality'); if (q) q.value = SET.quality;
  const m = $('#set-master'), mu = $('#set-music'), sx = $('#set-sfx');
  if (m) { m.value = Math.round(SET.master * 100); $('#v-master').textContent = Math.round(SET.master * 100); }
  if (mu) { mu.value = Math.round(SET.music * 100); $('#v-music').textContent = Math.round(SET.music * 100); }
  if (sx) { sx.value = Math.round(SET.sfx * 100); $('#v-sfx').textContent = Math.round(SET.sfx * 100); }
  updateFpsBadge();
}
function updateFpsBadge() {
  const el = $('#fps');
  if (!el) return;
  el.classList.toggle('on', !!SET.showFps);
  el.textContent = 'FPS ' + fpsNow + ' · ' + (SET.frameLimit ? SET.frameLimit : T('set.limitOff'));
}

function applyLanguage(code) {
  SET.lang = code;
  window.I18N.lang = code;
  saveSettings();
  document.documentElement.lang = code;
  applyI18n();
  refreshTexts();
  langButtons('lang-list');
  langButtons('menu-langs');
  renderAll();
  renderSpells();
  logLine('🌐 ' + window.I18N.LANGS.find(l => l.k === code).n);
}
/* переводим статичную разметку по data-i18n */
function applyI18n() {
  $$('[data-i18n]').forEach(el => {
    const k = el.dataset.i18n;
    const s = T(k);
    if (s && s !== k) el.textContent = s;
  });
  document.title = T('title');
  const bn = $('#enemy-name');
  if (bn && enemy) bn.textContent = enemy.name;
}

/* ============================== ФОН И ЧАСТИЦЫ ============================== */
/* Canvas может отсутствовать (например, отключён) — тогда просто нет фона,
   игра продолжает работать. */
const cv = $('#bg');
let cx = null;
try {
  const ctx2d = cv && cv.getContext ? cv.getContext('2d') : null;
  if (ctx2d && typeof ctx2d.createLinearGradient === 'function') cx = ctx2d;
} catch (e) { cx = null; }
let W = 0, H = 0, stars = [], fogs = [];
let bgLoc = 0, bgMix = 1;
const particles = [];
let fpsNow = 0;

function resize() {
  if (!cv) return;
  W = cv.width = window.innerWidth;
  H = cv.height = window.innerHeight;
  stars = [];
  const n = Math.min(200, Math.floor(W * H / 10000));
  for (let i = 0; i < n; i++) stars.push({ x: Math.random() * W, y: Math.random() * H, r: rnd(0.4, 1.6), s: rnd(0.04, 0.4), a: rnd(0.15, 0.8) });
  fogs = [];
  for (let i = 0; i < 6; i++) fogs.push({ x: Math.random() * W, y: Math.random() * H, r: rnd(90, 220), vx: rnd(-0.14, 0.14), vy: rnd(-0.1, 0.1), a: rnd(0.03, 0.08) });
}
const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
function mix(a, b, t) { const A = hexRgb(a), B = hexRgb(b); return [Math.round(A[0] + (B[0] - A[0]) * t), Math.round(A[1] + (B[1] - A[1]) * t), Math.round(A[2] + (B[2] - A[2]) * t)]; }

function burst(n, color) {
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2, sp = rnd(1.2, 6.5);
    particles.push({ x: W * (0.3 + Math.random() * 0.4), y: H * (0.25 + Math.random() * 0.3),
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 1, life: 1, decay: rnd(0.012, 0.03),
      size: rnd(1.4, 3.6), color: color || '#cfcfd6' });
  }
}

function drawBg() {
  if (!cx) return;
  /* фон рисуем только когда игра идёт: в меню и без состояния он не нужен */
  if (!S || !$('#app').classList.contains('on')) return;
  const a = LOCATIONS[clamp(bgLoc, 0, LOCATIONS.length - 1)];
  const b = LOCATIONS[clamp(bgLoc + 1, 0, LOCATIONS.length - 1)];
  const s1 = mix(a.sky[0], b.sky[0], bgMix), s2 = mix(a.sky[1], b.sky[1], bgMix);

  cx.clearRect(0, 0, W, H);
  const g = cx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgb(' + s1.join(',') + ')');
  g.addColorStop(0.6, 'rgb(' + mix(a.sky[0], a.sky[1], 0.6).join(',') + ')');
  g.addColorStop(1, 'rgb(' + mix(s2, '#050409', 0.5).join(',') + ')');
  cx.fillStyle = g; cx.fillRect(0, 0, W, H);

  fogs.forEach(o => {
    o.x += o.vx; o.y += o.vy;
    if (o.x < -o.r) o.x = W + o.r; if (o.x > W + o.r) o.x = -o.r;
    if (o.y < -o.r) o.y = H + o.r; if (o.y > H + o.r) o.y = -o.r;
    const rg = cx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
    rg.addColorStop(0, 'rgba(' + s2.join(',') + ',' + o.a + ')');
    rg.addColorStop(1, 'rgba(' + s2.join(',') + ',0)');
    cx.fillStyle = rg; cx.beginPath(); cx.arc(o.x, o.y, o.r, 0, Math.PI * 2); cx.fill();
  });

  stars.forEach(s => {
    s.a += s.s * 0.02;
    cx.fillStyle = 'rgba(230,220,200,' + (0.3 + Math.abs(Math.sin(s.a)) * 0.7).toFixed(2) + ')';
    cx.beginPath(); cx.arc(s.x, s.y, s.r, 0, Math.PI * 2); cx.fill();
  });

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.13; p.vx *= 0.985; p.life -= p.decay;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    cx.globalAlpha = clamp(p.life, 0, 1);
    cx.fillStyle = p.color;
    cx.beginPath(); cx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2); cx.fill();
  }
  cx.globalAlpha = 1;
}

/* ============================== СВАЙП И КЛИК ==============================
   Атака вместо нажатия: свайп по монстру. Резкое движение влево-вправо
   или по кругу наносит удар; длинный свайп — усиленный. Клик тоже работает. */
const SWIPE = { active: false, x0: 0, y0: 0, x1: 0, y1: 0, t0: 0, moved: 0, id: null, trail: [] };
let swipeFx = null;

function swipeStart(x, y) {
  if (paused) return;
  SWIPE.active = true; SWIPE.x0 = SWIPE.x1 = x; SWIPE.y0 = SWIPE.y1 = y;
  SWIPE.t0 = now(); SWIPE.moved = 0; SWIPE.trail = [[x, y]];
}
function swipeMove(x, y) {
  if (!SWIPE.active) return;
  SWIPE.moved += Math.hypot(x - SWIPE.x1, y - SWIPE.y1);
  SWIPE.x1 = x; SWIPE.y1 = y;
  SWIPE.trail.push([x, y]);
  if (SWIPE.trail.length > 14) SWIPE.trail.shift();
  if (SWIPE.moved > 6) drawTrail(SWIPE.trail);
}
function swipeEnd() {
  if (!SWIPE.active) return;
  SWIPE.active = false;
  const dx = SWIPE.x1 - SWIPE.x0, dy = SWIPE.y1 - SWIPE.y0;
  const dist = Math.hypot(dx, dy), dt = Math.max(1, now() - SWIPE.t0);
  const speed = dist / dt;
  removeTrail();
  if (dist >= 26 && speed > 0.15) {
    /* удар свайпом: чем резче, тем сильнее (но с потолком) */
    const power = clamp(0.9 + dist / 260, 1, 1.8);
    strike(power);
  } else if (dist < 14) {
    /* короткое касание — тоже удар, но слабее */
    strike(1);
  }
}
function strike(power) {
  if (!enemy || respawning || paused) return;
  dealDamage(power, {});
  SFX('hit');
  flashSwipe();
  if (enemy && enemy.hp > 0 && Math.random() < stats().doubleStrike) {
    logLine('⚡ ✕2');
    dealDamage(0.7, { silent: true });
  }
}
function flashSwipe() {
  const stage = $('#stage'); if (!stage) return;
  stage.classList.remove('struck'); void stage.offsetWidth; stage.classList.add('struck');
  const eb = document.querySelector('#enemy-wrap .bar.enemy');
  if (eb) { eb.classList.remove('hit'); void eb.offsetWidth; eb.classList.add('hit'); }
}
function drawTrail(pts) {
  if (!swipeFx) {
    swipeFx = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    swipeFx.setAttribute('class', 'swipe-fx');
    swipeFx.setAttribute('viewBox', '0 0 100 100');
    swipeFx.setAttribute('preserveAspectRatio', 'none');
    const st = $('#stage'); if (st) st.appendChild(swipeFx);
  }
  if (!swipeFx) return;
  const rect = $('#stage').getBoundingClientRect();
  const path = pts.map((p, i) => {
    const x = (p[0] - rect.left) / rect.width * 100, y = (p[1] - rect.top) / rect.height * 100;
    return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
  }).join(' ');
  /* красный след по траектории: видно, куда прошёл удар */
  swipeFx.innerHTML = '<path d="' + path + '" fill="none" stroke="rgba(220,40,44,0.55)" stroke-width="4.2" stroke-linecap="round" filter="url(#swGlow)"/>' +
    '<path d="' + path + '" fill="none" stroke="rgba(255,150,140,0.95)" stroke-width="1.5" stroke-linecap="round"/>' +
    '<defs><filter id="swGlow"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';
}
function removeTrail() {
  if (swipeFx) { swipeFx.remove(); swipeFx = null; }
}

/* Перерисовать тексты после смены языка: имя твари хранится в самом объекте
   (enemy.name), поэтому его мало переписать в разметке — иначе бой и журнал
   останутся на прежнем языке. */
function refreshTexts() {
  if (!enemy) return;
  enemy.name = (enemy.boss ? '👑 ' : '') + T('mob.' + enemy.key);
  const nn = $('#enemy-name');
  if (nn) nn.textContent = enemy.name;
}

/* ============================== ГЛАВНЫЙ ЦИКЛ ============================== */
let lastFrame = now(), lastSave = now(), fpsAcc = 0, fpsCnt = 0, frameAcc = 0;

function loop() {
  requestAnimationFrame(loop);
  const t = now();
  let dt = (t - lastFrame) / 1000; lastFrame = t;
  if (dt > 0.5) dt = 0.5;

  /* пауза: бой замирает, пока игрок в меню, инвентаре, лавке или настройках.
     Считаем её ДО шага по времени, иначе на первом же кадре после закрытия
     окна герой получил бы разом весь накопленный урон. И до ограничения
     частоты кадров — иначе на пропущенных кадрах пауза не обновилась бы. */
  updatePause();
  if (paused) return;

  /* ограничение кадров из настроек */
  if (SET.frameLimit) {
    frameAcc += dt;
    const step = 1 / SET.frameLimit;
    if (frameAcc < step) return;
    frameAcc = 0;
  }

  /* FPS */
  fpsAcc += dt; fpsCnt++;
  if (fpsAcc >= 0.5) {
    fpsNow = Math.round(fpsCnt / fpsAcc); fpsAcc = 0; fpsCnt = 0;
    if (SET.showFps) updateFpsBadge();
  }

  if (S) {
    bgMix = Math.min(1, bgMix + dt * 0.6);
    if (bgLoc !== locIdx() && bgMix >= 1) { bgLoc = locIdx(); bgMix = 0; window.AUDIO.setMusicLoc(locIdx()); }
    drawBg();

    if (enemy && !respawning) {
      const st = stats();
      timers.atk += dt;
      if (timers.atk >= st.atkInterval) { timers.atk = 0; basicAttack(false); }
      if (enemy) {
        const slowMul = enemy.slow > 0 ? 1.7 : 1;
        timers.en += dt;
        if (timers.en >= enemy.interval * slowMul) { timers.en = 0; enemyAttack(); }
        if (enemy.slow > 0) enemy.slow = Math.max(0, enemy.slow - dt);
        /* способности твари: активация по кулдауну и угасание эффектов */
        if (!respawning) tickEnemy(dt);
        if (!respawning) tickBurns(dt);
      }
      timers.regen += dt;
      if (timers.regen >= 1) {
        timers.regen = 0;
        if (st.regen > 0) S.hp = Math.min(st.maxHp, S.hp + st.regen);
        if (st.manaRegen > 0) S.mp = Math.min(st.maxMp, S.mp + st.manaRegen);
      }
      timers.mana += dt;
      if (timers.mana >= 0.2) { timers.mana = 0; renderHud(); }
    }

    /* перезарядки заклинаний */
    let cdChanged = false;
    for (const k in spellCd) {
      if (spellCd[k] > 0) { spellCd[k] = Math.max(0, spellCd[k] - dt); cdChanged = true; }
    }
    if (cdChanged && now() % 2 < 1) renderSpells();

    if (now() - lastSave > 15000) { lastSave = now(); save(); }
  }
}

/* ============================== СОБЫТИЯ ============================== */
function bindEvents() {
  /* свайп по арене */
  const stage = $('#stage');
  if (stage) {
    stage.addEventListener('pointerdown', e => {
      window.AUDIO.unlock();
      swipeStart(e.clientX, e.clientY);
    });
    stage.addEventListener('pointermove', e => { if (SWIPE.active) swipeMove(e.clientX, e.clientY); });
    stage.addEventListener('pointerup', () => swipeEnd());
    stage.addEventListener('pointercancel', () => { SWIPE.active = false; removeTrail(); });
    stage.addEventListener('pointerleave', () => { if (SWIPE.active) swipeEnd(); });
    stage.addEventListener('contextmenu', e => e.preventDefault());
  }

  /* клики по действиям через делегирование */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (el) {
      window.AUDIO.unlock();
      const name = el.dataset.act;
      if (name !== 'cast' && name !== 'page') SFX('click');
      if (handleAction(name, el)) { e.preventDefault(); return; }
    }
    const lang = e.target.closest('[data-lang]');
    if (lang) { applyLanguage(lang.dataset.lang); return; }
    const nav = e.target.closest('.nav-btn');
    if (nav) { const p = nav.dataset.page; curPage === p ? closePage() : openPage(p); }
  });
  document.addEventListener('mouseover', e => {
    const el = e.target.closest('[data-act], .nav-btn, .menu-btn, .lang-btn');
    if (el) SFX('hover');
  });

  $('#btn-sound').addEventListener('click', () => {
    const m = !window.AUDIO.isMuted();
    window.AUDIO.setMuted(m);
    $('#btn-sound').textContent = m ? '🔇' : '🔊';
    toast(m ? '🔇' : '🔊', T('set.audio'));
  });
  $('#btn-save').addEventListener('click', () => { save(); toast('💾', T('toast.saved')); });
  $('#btn-settings').addEventListener('click', () => openSettings());
  $('#btn-menu').addEventListener('click', () => openMenu());

  /* настройки */
  const f = $('#set-fps');
  if (f) f.addEventListener('change', () => { SET.showFps = f.checked; saveSettings(); syncSettingsUI(); });
  const l = $('#set-limit');
  if (l) l.addEventListener('change', () => { SET.frameLimit = Number(l.value); saveSettings(); syncSettingsUI(); });
  const q = $('#set-quality');
  if (q) q.addEventListener('change', () => { SET.quality = q.value; saveSettings(); renderAll(); });
  [['set-master', 'master', 'v-master'], ['set-music', 'music', 'v-music'], ['set-sfx', 'sfx', 'v-sfx']].forEach(([id, key, vid]) => {
    const el = $('#' + id);
    if (!el) return;
    el.addEventListener('input', () => {
      SET[key] = el.value / 100;
      $('#' + vid).textContent = el.value;
      window.AUDIO.setVolumes({ master: SET.master, music: SET.music, sfx: SET.sfx });
      saveSettings();
    });
  });

  /* клавиатура: пробел — удар, Q/W/E — заклинания, Esc — меню */
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    window.AUDIO.unlock();
    if (e.code === 'Space') { e.preventDefault(); strike(1); }
    if (e.code === 'Escape') { if ($('#settings').classList.contains('open')) closeSettings(); else if (curPage) closePage(); else openMenu(); }
    if (keyOf(e.code) === 'q') castSpell('fireball');
    if (keyOf(e.code) === 'w') castSpell('frost');
    if (keyOf(e.code) === 'e') castSpell('bolt');
    if (e.code === 'Digit1') openPage('hero');
    if (e.code === 'Digit2') openPage('inv');
    if (e.code === 'Digit3') openPage('up');
    if (e.code === 'Digit4') openPage('shop');
    if (e.code === 'Digit5') openPage('ach');
  });
  function keyOf(code) {
    const m = /^Key([A-Z])$/.exec(code);
    return m ? m[1].toLowerCase() : '';
  }

  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
}

/* ============================== ЗАПУСК ============================== */
function menuBackdrop() {
  const box = $('#menu-bg');
  if (!box) return;
  /* без группы дрожания: фильтра inkWob_bg больше нет, а ссылка на
     необъявленный фильтр заставила бы браузер не рисовать фон целиком */
  box.innerHTML = '<svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">' +
    window.SCENES.render('abyss') + '</svg>';
}

function init() {
  if (!window.I18N || !window.AUDIO || !window.MONSTERS || !window.SCENES || !window.ITEMART) return;
  loadSettings();
  applyI18n();
  langButtons('menu-langs');
  menuBackdrop();
  resize();
  bindEvents();

  /* главное меню: играть / новая игра / настройки / об игре */
  const mm = $('#mainmenu');
  mm.classList.add('open');
  const playBtn = mm.querySelector('[data-act="menu-play"]');
  if (playBtn && hasSave()) playBtn.textContent = T('menu.continue');

  S = null;
  requestAnimationFrame(loop);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

/* отладочный доступ для тестов и консоли */
window.__void = {
  get S() { return S; }, get enemy() { return enemy; }, get set() { return SET; },
  get curPage() { return curPage; },
  get paused() { return paused; }, updatePause, pausedNow, openModal, closeModal,
  stats, loc, locName, locSub, locIdx, LOCATIONS, RARITIES, SLOTS, BAG_SIZE, UPGRADES, PERKS,
  SPELLS, ACHIEVEMENTS, MONSTERS_PER_LOC, saveKey: SAVE_KEY,
  openPage, closePage, renderAll, renderPanels, makeEnemy, spawnEnemy, killEnemy, makeChest,
  openChest, rollItem, equipItem, sellItem, buyUpgrade, buyStock, stats, perkAdd,
  gainXp, dealDamage, basicAttack, strike, castSpell, enemyAttack, playerDeath,
  startGame, openSettings, closeSettings, applyLanguage, language: () => SET.lang,
  swipeStart, swipeMove, swipeEnd, hasSave, load, save, freshState,
  setEnemy(e) { enemy = e; }, setRespawning(v) { respawning = !!v; }, setLevel(n) { S.level = n; },
  KNOWLEDGE: window.KNOWLEDGE, knAll, knLv, buyNode, gainKp, applyBurn, tickBurns, clearBurns,
  get burns() { return BURNS; },
  setLoc(k) { S.locKey = k; S.idx = 1; }, setIdx(n) { S.idx = n; }, setCycle(n) { S.cycle = n; },
  enemyAbility, tickEnemy, get perkQueue() { return perkQueue; }, pickPerk
};
