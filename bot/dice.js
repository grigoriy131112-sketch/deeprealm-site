// The dice: three rolls per /roll, each with half of the matching characteristic
// added, rounded down.
//
//   crit  -> Strength   (крит-урон)
//   block -> Strength   (блок)
//   dodge -> Reaction   (уклонение)
//
// The roll is a d20. Crit lands on 19-20 (doubling the damage) and 1-10 is the
// fumble the combat rules describe (a roll can never total below 2, so the range
// has to be wider than a natural 1). `rollOnce` is exported so tests can inject a
// fixed die.

import { ROLLS, STAT_BY_KEY, bonus } from './stats.js';
import { COMBAT } from './rules/combat.js';

export const DIE = COMBAT.dice.die;

// A random integer in [1, sides].
export function rollOnce(sides = DIE, rng = Math.random) {
  return Math.floor(rng() * sides) + 1;
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
    const crit = key === 'crit' && raw >= COMBAT.dice.crit.crit;
    const fumble = key === 'crit' && raw <= COMBAT.dice.crit.fumble;
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
      fumble
    };
  });
}

// The message the bot posts to the group.
export function formatRoll(sheet, results) {
  const name = sheet && sheet.name ? sheet.name : 'Безымянный';
  const slot = sheet && sheet.slot ? ` #${sheet.slot}` : '';
  const lines = results.map((r) => {
    let tail = '';
    if (r.crit) tail = `  💥 КРИТ ×${COMBAT.dice.crit.multiplier}`;
    else if (r.fumble) tail = '  ⚠️ провал (+5 по тебе)';
    return `${r.ru}:  d20 = ${r.raw} → ${r.raw} + ${r.plus} = ${r.total}${tail}`;
  });
  return ['🎲 ' + name + slot, ...lines].join('\n');
}
