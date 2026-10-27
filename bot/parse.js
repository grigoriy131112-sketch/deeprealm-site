// Reading a player's messages.
//
// Registration is a name plus the fourteen ratings, in any order, separated by
// commas or newlines. The parser is forgiving about the separators and about the
// characteristic names (see stats.resolveStat) but strict about the values: a
// rating is a whole number from 1 to 10.

import { STAT_KEYS, resolveStat, isRating } from './stats.js';

// "/reg Аттар\nСила 8, Скорость 6, ..." -> { name, stats, unknown }
// `stats` holds only the ratings that parsed; `unknown` lists names we did not
// recognise, so the reply can tell the player exactly what to fix.
export function parseSheet(text) {
  const body = String(text || '').replace(/^\/reg\b/i, ' ').trim();
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const name = (lines.shift() || '').trim();
  const stats = {};
  const unknown = [];

  const rest = lines.join(', ');
  for (const chunk of rest.split(/[,;]+|\n/)) {
    const part = chunk.trim();
    if (!part) continue;
    const m = part.match(/^(.+?)\s*[:\-–=]?\s*(\d{1,2})$/);
    if (!m) {
      unknown.push(part);
      continue;
    }
    const key = resolveStat(m[1]);
    const value = Number(m[2]);
    if (!key) {
      unknown.push(m[1].trim());
      continue;
    }
    if (!isRating(value)) {
      unknown.push(`${m[1].trim()} ${m[2]} (нужно 1–10)`);
      continue;
    }
    stats[key] = value;
  }

  return { name, stats, unknown, missing: STAT_KEYS.filter((k) => !(k in stats)) };
}

// A post may carry a plan for a lucky strike: "атакую; если крит — добиваю".
// We keep the tail after the trigger so the bot can echo it back when the crit
// roll actually lands.
export function extractConditional(text) {
  const m = String(text || '').match(
    /если\s+крит[а-яё]*(?:\s+(?:удастся|удался|прошёл|прошел|сработает|выпадет))?\s*[—\-–,:]?\s*(.+)$/is
  );
  return m ? m[1].trim().replace(/[.\s]+$/, '') : null;
}

// True when the post asks the bot to roll.
export function wantsRoll(text) {
  return /(^|\s)\/roll\b/i.test(String(text || ''));
}

// The command word at the start of a message, lower-cased, or null.
export function commandOf(text) {
  const m = String(text || '').match(/^\/([a-zа-яё_]+)(?:@\w+)?/i);
  return m ? m[1].toLowerCase() : null;
}
