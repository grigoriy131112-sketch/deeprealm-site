// The dice: three rolls per /roll, each with half of the matching characteristic
// added, rounded down.
//
//   crit  -> Strength   (крит-урон)
//   block -> Strength   (блок)
//   dodge -> Reaction   (уклонение)
//
// The die is 0-20 (21 faces), so a 0 can come up. The bands read the *total*
// (raw die plus half a characteristic), the number the bot prints. The
// crit-damage roll has its own five bands: 0-5 промах (+5 по тебе), 6-9 промах,
// 10-12 половина урона, 13-18 обычная атака, 19-20 крит (урон ×2). Defence is a
// chain: the higher bonus goes first (block for a strong sheet, dodge for a
// nimble one), and the second is rolled only when the first fails. `rollOnce` is
// exported so tests can inject a fixed die.

import { ROLLS, STAT_BY_KEY, bonus } from './stats.js';
import { COMBAT } from './rules/combat.js';

export const DIE = COMBAT.dice.die;

// A random integer in [0, sides - 1]: 21 faces give 0 through 20.
export function rollOnce(sides = DIE, rng = Math.random) {
  return Math.floor(rng() * sides);
}

// The order the three rolls are shown in.
export const ROLL_ORDER = ['crit', 'block', 'dodge'];

// Which defence is rolled first. The higher bonus leads - block for a strong
// sheet, dodge for a nimble one - and Strength wins a tie, so a default sheet
// blocks first. Both `bonus` calls are floored, so this is the same number the
// roll adds.
export function defenseOrder(sheet) {
  const stats = sheet && sheet.stats ? sheet.stats : {};
  const str = bonus(Number(stats.strength) || 0);
  const rea = bonus(Number(stats.reaction) || 0);
  return rea > str ? ['dodge', 'block'] : ['block', 'dodge'];
}

function makeRoll(key, raw, stats) {
  const def = ROLLS[key];
  const statKey = def.stat;
  const statValue = Number(stats[statKey]) || 0;
  const plus = bonus(statValue);
  const total = raw + plus;
  const cc = COMBAT.dice.crit;
  const crit = key === 'crit' && total >= cc.crit;
  const fumble = key === 'crit' && total <= cc.fumble;
  const miss = key === 'crit' && total >= cc.miss && total < cc.half;
  const half = key === 'crit' && total >= cc.half && total < cc.hit;
  const hit = key === 'crit' && total >= cc.hit && total < cc.crit;
  const dodgeSuccess = key === 'dodge' && total >= COMBAT.dice.dodge.success;
  const blockSuccess = key === 'block' && total >= COMBAT.dice.block.success;
  return {
    key,
    ru: def.ru,
    statKey,
    statRu: STAT_BY_KEY[statKey].ru,
    statValue,
    plus,
    raw,
    total,
    crit,
    fumble,
    miss,
    half,
    hit,
    dodgeSuccess,
    blockSuccess
  };
}

// Build the results for one player sheet. The crit-damage roll always happens;
// the defence is a chain, so the second defence is rolled only when the first
// one fails. `dice` lets a caller (a test, or a replay) pin the raw numbers;
// otherwise they are rolled fresh. The returned array keeps ROLL_ORDER, so a
// reader can index [crit, block, dodge] and a defence may be missing.
export function rollSet(sheet, dice = null, rng = Math.random) {
  const stats = sheet && sheet.stats ? sheet.stats : {};
  const raw = (i) => (dice && dice[i] != null ? Number(dice[i]) : rollOnce(DIE, rng));
  const [first, second] = defenseOrder(sheet);

  const crit = makeRoll('crit', raw(0), stats);
  const firstRoll = makeRoll(first, raw(1), stats);

  // The first defence saves the character unless it failed outright.
  const firstSaved = first === 'block'
    ? firstRoll.total >= COMBAT.dice.block.partial
    : firstRoll.dodgeSuccess;

  const rolls = [crit, firstRoll];
  if (!firstSaved) rolls.push(makeRoll(second, raw(2), stats));

  return rolls.sort((a, b) => ROLL_ORDER.indexOf(a.key) - ROLL_ORDER.indexOf(b.key));
}

// The message the bot posts to the group.
export function formatRoll(sheet, results) {
  const name = sheet && sheet.name ? sheet.name : 'Безымянный';
  const slot = sheet && sheet.slot ? ` #${sheet.slot}` : '';
  const lines = results.map((r) => {
    // Every roll states its outcome, win or lose: the owner asked for both bands
    // to be written ("0-15 провал, 16-20 успех"), and a dodge or block that only
    // spoke up on success read as if nothing had happened.
    let tail = '';
    if (r.key === 'crit') {
      if (r.crit) tail = `  💥 КРИТ ×${COMBAT.dice.crit.multiplier}`;
      else if (r.fumble) tail = '  ⚠️ промах (+5 по тебе)';
      else if (r.miss) tail = '  ⚠️ промах';
      else if (r.half) tail = '  ➗ половина урона';
      else tail = '  ✅ обычная атака';
    } else if (r.key === 'dodge') {
      tail = r.dodgeSuccess
        ? '  🛡️ уклонение удалось — атака промахнулась (урон 0)'
        : '  ⚠️ уклонение не удалось — урон полный';
    } else if (r.key === 'block') {
      if (r.total >= COMBAT.dice.block.full) tail = '  🛡️ блок полный — урон 0 (если есть щит; без щита — урон пополам)';
      else if (r.blockSuccess) tail = '  🛡️ блок частичный — урон пополам';
      else tail = '  ⚠️ блок не удался — урон полный';
    }
    return `${r.ru}:  d21 = ${r.raw} → ${r.raw} + ${r.plus} = ${r.total}${tail}`;
  });
  return ['🎲 ' + name + slot, ...lines].join('\n');
}
