// The RP bot's behaviour, kept apart from Telegram itself so it can be tested
// without a network: `createBot` takes a `send(chatId, text, replyTo)` function
// and returns a `handleUpdate` that only decides what to say.
//
// Flow:
//   * a player registers in a private chat with /reg, sending their name and the
//     fourteen ratings once;
//   * in the game group a player ends a post with /roll, and the bot answers with
//     the three dice - crit, block, dodge - each with half of the matching
//     characteristic added.

import { STATS, STAT_BY_KEY, ROLLS, bonus } from './stats.js';
import { FEATS, featFor } from './rules/feats.js';
import { COMBAT, BONUS_RULE } from './rules/combat.js';
import { rollSet, formatRoll } from './dice.js';
import { parseSheet, extractConditional, wantsRoll, commandOf } from './parse.js';

const NAME = 'Куб';
const MAX_MSG = 3800;

function featsFor(stats) {
  const out = [];
  for (const s of STATS) {
    const feat = featFor(s.key, stats[s.key]);
    if (feat) out.push({ stat: s, feat });
  }
  return out;
}

function sheetText(record) {
  const stats = record.stats || {};
  const parts = STATS.map((s) => `${s.ru} ${stats[s.key] ?? '—'}`);
  const lines = [`📜 ${record.name}`, parts.join(', ')];
  const feats = featsFor(stats);
  if (feats.length) {
    lines.push('');
    lines.push('Фишки:');
    for (const { stat, feat } of feats) {
      lines.push(`• ${stat.ru} — «${feat.base}»`);
    }
  }
  return lines.join('\n');
}

export function createBot({ store, send }) {
  function reply(chatId, text, replyTo) {
    for (const part of split(text)) send(chatId, part, replyTo);
  }

  async function handleReg(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from && msg.from.id;
    if (msg.chat.type !== 'private') {
      reply(chatId, 'Регистрация — только в личке со мной, чтобы статы не видел никто лишний. Напиши мне в ЛС: /reg Имя и статы.', msg.message_id);
      return;
    }
    const parsed = parseSheet(msg.text || '');
    if (!parsed.name) {
      reply(chatId, 'Напиши так:\n/reg Аттар\nСила 8, Скорость 6, Ловкость 5, Выносливость 6, Здоровье 8, Реакция 6, Хитрость 5, Интеллект 7, Сообразительность 6, Изворотливость 4, Агрессивность 3, Доброта 6, Харизма 5, Эмпатия 4', msg.message_id);
      return;
    }
    const record = await store.set(userId, { name: parsed.name, stats: parsed.stats, tgUser: msg.from && msg.from.username });
    const lines = ['✅ Записал, ' + parsed.name + '.', '', sheetText(record)];
    if (parsed.unknown.length) {
      lines.push('', 'Не понял: ' + parsed.unknown.join(', ') + '.');
    }
    if (parsed.missing.length) {
      const names = parsed.missing.map((k) => STAT_BY_KEY[k].ru).join(', ');
      lines.push('', 'Не хватает: ' + names + '. Их можно добавить позже — пришли /reg заново с полным списком.');
    }
    reply(chatId, lines.join('\n'), msg.message_id);
  }

  async function handleRoll(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from && msg.from.id;
    const record = await store.get(userId);
    if (!record) {
      reply(chatId, 'Тебя ещё нет в списке. Напиши мне в ЛС /reg Имя и статы — и я начну кидать.', msg.message_id);
      return;
    }
    const results = rollSet(record);
    const lines = [formatRoll(record, results)];
    const conditional = extractConditional(msg.text || '');
    const crit = results.find((r) => r.key === 'crit');
    if (conditional) {
      lines.push('');
      lines.push(crit && crit.crit
        ? `💥 Крит удался — применяю: ${conditional}`
        : 'Крит не удался — условие не срабатывает.');
    }
    reply(chatId, lines.join('\n'), msg.message_id);
  }

  async function handleRules(msg) {
    const lines = ['⚔️ Боевые правила', ''];
    lines.push(`За ход: ${COMBAT.turn.full} полное действие и ${COMBAT.turn.partial} неполных.`);
    lines.push('Полное: ' + COMBAT.turn.fullActions.map((a) => a.ru).join(', ') + '.');
    lines.push('Неполное: ' + COMBAT.turn.partialActions.map((a) => a.ru).join(', ') + '.');
    lines.push('', 'Разрешение атаки:');
    COMBAT.resolution.forEach((r, i) => lines.push(`${i + 1}. ${r}`));
    lines.push('', COMBAT.dice.crit.ru);
    lines.push(COMBAT.dice.block.ru);
    lines.push('', BONUS_RULE);
    lines.push('', COMBAT.grid.move);
    lines.push(COMBAT.grid.diagonal);
    lines.push(COMBAT.grid.cover);
    lines.push('', COMBAT.conditional);
    reply(msg.chat.id, lines.join('\n'), msg.message_id);
  }

  async function handleFeats(msg) {
    const userId = msg.from && msg.from.id;
    const record = await store.get(userId);
    const lines = ['✨ Фишки (8–10)'];
    if (record) {
      const mine = featsFor(record.stats);
      if (mine.length) {
        lines.push('', 'Твои открытые:');
        for (const { stat, feat } of mine) lines.push(`• ${stat.ru} — «${feat.base}» (${feat.tier})`);
      } else {
        lines.push('', 'У тебя пока нет фишек: нужна характеристика 8 и выше.');
      }
      lines.push('');
    }
    lines.push('Все фишки:');
    for (const s of STATS) {
      const f = FEATS[s.key];
      if (f) lines.push(`• ${s.ru} — «${f.base}»`);
    }
    reply(msg.chat.id, lines.join('\n'), msg.message_id);
  }

  async function handleMy(msg) {
    const record = await store.get(msg.from && msg.from.id);
    reply(msg.chat.id, record ? sheetText(record) : 'Тебя ещё нет в списке. Напиши в ЛС /reg Имя и статы.', msg.message_id);
  }

  async function handleStart(msg) {
    reply(msg.chat.id, [
      'Я кидаю кубик для Deeprealm.',
      '',
      'В личке: /reg Имя и статы — записать персонажа.',
      'В общем чате: закончи пост на /roll — и я выдам крит, блок и уклонение.',
      '',
      'Ещё: /rules — правила боя, /feats — фишки, /my — мой лист.'
    ].join('\n'), msg.message_id);
  }

  function handleUpdate(update) {
    const msg = update && (update.message || update.edited_message);
    if (!msg || !msg.text) return undefined;
    const cmd = commandOf(msg.text);
    if (cmd) {
      if (cmd === 'start' || cmd === 'help') return handleStart(msg);
      if (cmd === 'reg' || cmd === 'register') return handleReg(msg);
      if (cmd === 'roll') return handleRoll(msg);
      if (cmd === 'rules') return handleRules(msg);
      if (cmd === 'feats') return handleFeats(msg);
      if (cmd === 'my') return handleMy(msg);
      return undefined;
    }
    // A plain post that ends with /roll: roll for the author.
    if (wantsRoll(msg.text)) return handleRoll(msg);
    return undefined;
  }

  return { handleUpdate };
}

function split(text, limit = MAX_MSG) {
  const s = String(text || '');
  if (s.length <= limit) return [s];
  const out = [];
  let rest = s;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n', limit);
    if (cut < limit / 2) cut = limit;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n+/, '');
  }
  if (rest) out.push(rest);
  return out;
}

export { bonus, ROLLS };
