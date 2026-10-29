// The dice: three rolls per /roll, each with half of the matching characteristic
// added, rounded down.
//
//   crit  -> Strength   (крит-урон)
//   block -> Strength   (блок)
//   dodge -> Reaction   (уклонение)
//
// The die is 0-20 (21 faces), so a 0 can come up. The owner's bands read the
// *total* (raw die plus half a characteristic), the number the bot prints: 0-15 is
// a fumble and 16-20 is a success. On the crit roll the success band splits once
// more - 16-18 an ordinary hit, 19-20 a crit (doubling the damage). `rollOnce` is
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

// Build the three results for one player sheet. `dice` lets a caller (a test, or
// a replay) pin the raw numbers; otherwise they are rolled fresh.
export function rollSet(sheet, dice = null, rng = Math.random) {
  const stats = sheet && sheet.stats ? sheet.stats : {};
  return ROLL_ORDER.map((key, i) => {
    const def = ROLLS[key];
    const statKey = def.stat;
    const statValue = Number(stats[statKey]) || 0;
    const plus = bonus(statValue);
    const raw = dice && dice[i] != null ? Number(dice[i]) : rollOnce(DIE, rng);
    const total = raw + plus;
    const crit = key === 'crit' && total >= COMBAT.dice.crit.crit;
    const fumble = key === 'crit' && total <= COMBAT.dice.crit.fumble;
    const success = total >= COMBAT.dice.crit.success;
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
      success,
      dodgeSuccess,
      blockSuccess
    };
  });
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
      else if (r.fumble) tail = '  ⚠️ провал (+5 по тебе)';
      else tail = '  ✅ обычная атака';
    } else if (r.key === 'dodge') {
      tail = r.dodgeSuccess
        ? '  🛡️ уклонение удалось — атака промахнулась (урон 0)'
        : '  ⚠️ уклонение не удалось — урон полный';
    } else if (r.key === 'block') {
      if (r.total >= COMBAT.dice.block.full) tail = '  🛡️ блок полный — урон 0';
      else if (r.blockSuccess) tail = '  🛡️ блок частичный — урон пополам';
      else tail = '  ⚠️ блок не удался — урон полный';
    }
    return `${r.ru}:  d21 = ${r.raw} → ${r.raw} + ${r.plus} = ${r.total}${tail}`;
  });
  return ['🎲 ' + name + slot, ...lines].join('\n');
}
