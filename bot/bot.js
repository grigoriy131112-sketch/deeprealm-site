// The RP bot's behaviour, kept apart from Telegram itself so it can be tested
// without a network: `createBot` takes a `send(chatId, text, replyTo)` function
// and returns a `handleUpdate` that only decides what to say.
//
// Flow:
//   * a player registers in a private chat with /reg, sending their name and the
//     fourteen ratings once;
//   * in the game group a player ends a post with /roll, and the bot answers with
//     the three dice - crit, block, dodge - each with half of the matching
//     characteristic added;
//   * /menu (and /start) opens a three-section inline menu - battle rules, stat
//     feats, dice and commands - whose buttons edit the message in place.

import { STATS, STAT_BY_KEY, ROLLS, bonus } from './stats.js';
import { featFor } from './rules/feats.js';
import { rollSet, formatRoll } from './dice.js';
import { parseSheet, extractConditional, wantsRoll, commandOf } from './parse.js';
import { isMenuSection, sectionText, menuKeyboard } from './menu.js';

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

export function createBot({ store, send, editMessage, answerCallback }) {
  // Must be awaited: a Worker that returns before sendMessage settles has its
  // in-flight request cancelled, so the player never sees the reply. threadId is
  // the forum topic the post came from, so the reply lands in that topic. The
  // keyboard, when present, is the menu.
  async function reply(chatId, text, replyTo, threadId, keyboard) {
    for (const part of split(text)) await send(chatId, part, replyTo, threadId, keyboard);
  }

  async function handleReg(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from && msg.from.id;
    if (msg.chat.type !== 'private') {
      return reply(chatId, 'Регистрация — только в личке со мной, чтобы статы не видел никто лишний. Напиши мне в ЛС: /reg Имя и статы.', msg.message_id, msg.message_thread_id);
    }
    const parsed = parseSheet(msg.text || '');
    if (!parsed.name) {
      return reply(chatId, 'Напиши так:\n/reg Аттар\nСила 8, Скорость 6, Ловкость 5, Выносливость 6, Здоровье 8, Реакция 6, Хитрость 5, Интеллект 7, Сообразительность 6, Изворотливость 4, Агрессивность 3, Доброта 6, Харизма 5, Эмпатия 4', msg.message_id, msg.message_thread_id);
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
    return reply(chatId, lines.join('\n'), msg.message_id, msg.message_thread_id);
  }

  async function handleRoll(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from && msg.from.id;
    const record = await store.get(userId);
    if (!record) {
      return reply(chatId, 'Тебя ещё нет в списке. Напиши мне в ЛС /reg Имя и статы — и я начну кидать.', msg.message_id, msg.message_thread_id);
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
    return reply(chatId, lines.join('\n'), msg.message_id, msg.message_thread_id);
  }

  // The menu lives in one message: /menu (and /start) posts it, and each button
  // edits that same message, so the chat is not flooded with copies.
  async function handleMenu(msg) {
    return reply(msg.chat.id, sectionText('home'), msg.message_id, msg.message_thread_id, menuKeyboard());
  }

  async function handleMenuCallback(query) {
    const data = String(query.data || '');
    const key = data.startsWith('menu:') ? data.slice(5) : 'home';
    const active = isMenuSection(key) ? key : null;
    const chatId = query.message && query.message.chat && query.message.chat.id;
    const messageId = query.message && query.message.message_id;
    const userId = query.from && query.from.id;
    const record = await store.get(userId);

    if (answerCallback) await answerCallback(query.id);

    if (editMessage && chatId && messageId) {
      await editMessage(chatId, messageId, sectionText(key, record), menuKeyboard(active));
    }
    return undefined;
  }

  async function handleRules(msg) {
    return reply(msg.chat.id, sectionText('rules'), msg.message_id, msg.message_thread_id, menuKeyboard('rules'));
  }

  async function handleFeats(msg) {
    const record = await store.get(msg.from && msg.from.id);
    return reply(msg.chat.id, sectionText('feats', record), msg.message_id, msg.message_thread_id, menuKeyboard('feats'));
  }

  async function handleMy(msg) {
    const record = await store.get(msg.from && msg.from.id);
    return reply(msg.chat.id, record ? sheetText(record) : 'Тебя ещё нет в списке. Напиши в ЛС /reg Имя и статы.', msg.message_id, msg.message_thread_id);
  }

  async function handleStart(msg) {
    return reply(msg.chat.id, [
      'Я кидаю кубик для Deeprealm.',
      '',
      'В личке: /reg Имя и статы — записать персонажа.',
      'В общем чате: закончи пост на /roll — и я выдам крит, блок и уклонение.',
      '',
      'Меню: /menu — правила боя, фишки, кубик.',
      'Ещё: /my — мой лист.'
    ].join('\n'), msg.message_id, msg.message_thread_id, menuKeyboard());
  }

  function handleUpdate(update) {
    if (update && update.callback_query) return handleMenuCallback(update.callback_query);
    const msg = update && (update.message || update.edited_message);
    if (!msg || !msg.text) return undefined;
    const cmd = commandOf(msg.text);
    if (cmd) {
      if (cmd === 'start' || cmd === 'help') return handleStart(msg);
      if (cmd === 'menu') return handleMenu(msg);
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
