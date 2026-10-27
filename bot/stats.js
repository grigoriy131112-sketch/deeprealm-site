// The fourteen Deeprealm characteristics.
//
// Six of them carry numbers that reach the dice: Strength, Speed, Agility,
// Stamina, Health and Reaction. The other eight are role-play only - they have a
// rating (so the 8-10 feats can open) but never add a bonus to a roll. The order
// here is the order the sheet is read and printed in.

export const STATS = [
  { key: 'strength', ru: 'Сила', short: 'СИЛ', group: 'physical', aliases: ['сила', 'str', 'sila'] },
  { key: 'speed', ru: 'Скорость', short: 'СКО', group: 'physical', aliases: ['скорость', 'skorost'] },
  { key: 'agility', ru: 'Ловкость', short: 'ЛОВ', group: 'physical', aliases: ['ловкость', 'lovkost'] },
  { key: 'stamina', ru: 'Выносливость', short: 'ВЫН', group: 'physical', aliases: ['выносливость', 'vynoslivost'] },
  { key: 'health', ru: 'Здоровье', short: 'ЗДО', group: 'physical', aliases: ['здоровье', 'zdorovie'] },
  { key: 'reaction', ru: 'Реакция', short: 'РЕА', group: 'physical', aliases: ['реакция', 'reakciya'] },
  { key: 'cunning', ru: 'Хитрость', short: 'ХИТ', group: 'social', aliases: ['хитрость', 'hitrost'] },
  { key: 'intellect', ru: 'Интеллект', short: 'ИНТ', group: 'social', aliases: ['интеллект', 'intellekt'] },
  { key: 'wits', ru: 'Сообразительность', short: 'СОО', group: 'social', aliases: ['сообразительность', 'soobrazitelnost'] },
  { key: 'evasion', ru: 'Изворотливость', short: 'ИЗВ', group: 'social', aliases: ['изворотливость', 'izvorotlivost'] },
  { key: 'aggression', ru: 'Агрессивность', short: 'АГР', group: 'social', aliases: ['агрессивность', 'agressivnost'] },
  { key: 'kindness', ru: 'Доброта', short: 'ДОБ', group: 'social', aliases: ['доброта', 'dobrota'] },
  { key: 'charisma', ru: 'Харизма', short: 'ХАР', group: 'social', aliases: ['харизма', 'harizma'] },
  { key: 'empathy', ru: 'Эмпатия', short: 'ЭМП', group: 'social', aliases: ['эмпатия', 'empatiya'] }
];

export const STAT_KEYS = STATS.map((s) => s.key);

export const STAT_BY_KEY = Object.fromEntries(STATS.map((s) => [s.key, s]));

// The three rolls a /roll answers. Each one names the characteristic that feeds
// its bonus, so the dice module never hard-codes a stat name.
export const ROLLS = {
  crit: { key: 'crit', ru: 'Крит-урон', stat: 'strength' },
  block: { key: 'block', ru: 'Блок', stat: 'strength' },
  dodge: { key: 'dodge', ru: 'Уклонение', stat: 'reaction' }
};

// Half of the rating, rounded down: Strength 8 -> +4, Reaction 5 -> +2. This is
// the only place the bonus is derived, so the rule cannot drift between the
// rolls and the printed sheet.
export function bonus(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n / 2);
}

// A rating the feats can hang on: a whole number from 1 to 10.
export function isRating(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 10;
}

// Resolve whatever a player typed ("Сила", "сила", "str", "sila") to a stat key.
export function resolveStat(name) {
  const raw = String(name || '').trim().toLowerCase().replace(/ё/g, 'е');
  if (!raw) return null;
  const direct = STATS.find((s) => s.key === raw || s.ru.toLowerCase() === raw || s.short.toLowerCase() === raw);
  if (direct) return direct.key;
  const alias = STATS.find((s) => s.aliases.includes(raw));
  return alias ? alias.key : null;
}
