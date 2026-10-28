// The RP bot's behaviour, kept apart from Telegram itself so it can be tested
// without a network: `createBot` takes a `send(chatId, text, replyTo)` function
// and returns a `handleUpdate` that only decides what to say.
//
// Flow:
//   * a player registers in a private chat with /reg, sending a character's name,
//     handle and the fourteen ratings. Up to two characters per account;
//   * in the game group a player ends a post with /roll - or /roll 1, /roll 2 to
//     say which character - and the bot answers with the three dice - crit,
//     block, dodge - each with half of the matching characteristic added;
//   * /del 1, /del 2 or /delall (also /del all) drops a character;
//   * /menu (and /start) opens the menu - battle rules, battle-post rules, stat
//     feats, dice and commands - whose buttons edit the message in place.

import { STATS, STAT_BY_KEY, ROLLS, bonus } from './stats.js';
import { featFor } from './rules/feats.js';
import { rollSet, formatRoll } from './dice.js';
import { parseSheet, extractConditional, wantsRoll, commandOf, rollSlot, commandArgs } from './parse.js';
import { charactersOf, characterAt, canAdd, nextSlot, addCharacter, removeCharacter, MAX_CHARACTERS } from './characters.js';
import { isMenuSection, sectionText, menuKeyboard } from './menu.js';

const NAME = 'Куб';
const MAX_MSG = 3800;

const REG_HELP = [
  'Напиши так (можно добавить @твой_юзер):',
  '/reg Аттар @attar',
  'Сила 8, Скорость 6, Ловкость 5, Выносливость 6, Здоровье 8, Реакция 6, Хитрость 5, Интеллект 7, Сообразительность 6, Изворотливость 4, Агрессивность 3, Доброта 6, Харизма 5, Эмпатия 4'
].join('\n');

function featsFor(stats) {
  const out = [];
  for (const s of STATS) {
    const feat = featFor(s.key, stats[s.key]);
    if (feat) out.push({ stat: s, feat });
  }
  return out;
}

// One character as text: its slot and name, its handle, the fourteen ratings and
// the feats they open.
function characterText(character) {
  const stats = character.stats || {};
  const parts = STATS.map((s) => `${s.ru} ${stats[s.key] ?? '—'}`);
  const user = character.user ? ` (@${character.user})` : '';
  const lines = [`📜 ${character.slot}. ${character.name}${user}`, parts.join(', ')];
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

// A short list of the player's characters, for /my and the "which one?" replies.
function characterList(record) {
  const chars = charactersOf(record);
  if (!chars.length) return '';
  return chars.map((c) => `• ${c.slot}. ${c.name}${c.user ? ` (@${c.user})` : ''}`).join('\n');
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
      return reply(chatId, REG_HELP, msg.message_id, msg.message_thread_id);
    }
    const record = await store.get(userId);
    if (!canAdd(record)) {
      return reply(chatId, [
        `У тебя уже ${MAX_CHARACTERS} персонажа — больше нельзя.`,
        '',
        characterList(record),
        '',
        'Удали одного: /del 1 или /del 2 (или /delall) — и запиши заново.'
      ].join('\n'), msg.message_id, msg.message_thread_id);
    }
    const slot = nextSlot(record);
    const updated = addCharacter(record, {
      name: parsed.name,
      stats: parsed.stats,
      user: parsed.user || (msg.from && msg.from.username) || ''
    });
    await store.set(userId, updated);
    const character = characterAt(updated, slot);
    const lines = [`✅ Записал персонажа ${slot}: ${character.name}.`, '', characterText(character)];
    if (parsed.unknown.length) {
      lines.push('', 'Не понял: ' + parsed.unknown.join(', ') + '.');
    }
    if (parsed.missing.length) {
      const names = parsed.missing.map((k) => STAT_BY_KEY[k].ru).join(', ');
      lines.push('', 'Не хватает: ' + names + '. Повторный /reg создаёт нового персонажа, так что ненужного сначала удали: /del ' + slot + '.');
    }
    lines.push('', `В бою заканчивай пост на /roll ${slot}.`);
    if (canAdd(updated)) {
      lines.push(`Можно завести второго персонажа — пришли /reg снова. Всего можно ${MAX_CHARACTERS}.`);
    }
    return reply(chatId, lines.join('\n'), msg.message_id, msg.message_thread_id);
  }

  async function handleRoll(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from && msg.from.id;
    const record = await store.get(userId);
    if (!record || !charactersOf(record).length) {
      return reply(chatId, 'Тебя ещё нет в списке. Напиши мне в ЛС /reg Имя и статы — и я начну кидать.', msg.message_id, msg.message_thread_id);
    }
    // The number after /roll picks the character; without one, the first slot.
    const requested = rollSlot(msg.text);
    const slot = requested == null ? 1 : requested;
    const character = characterAt(record, slot);
    if (!character) {
      const chars = charactersOf(record);
      const have = chars.map((c) => c.slot).join(' или ');
      return reply(chatId, `У тебя нет персонажа ${slot}. Доступны слоты: ${have}. Укажи номер: /roll ${chars[0].slot}.`, msg.message_id, msg.message_thread_id);
    }
    const results = rollSet(character);
    const lines = [formatRoll(character, results)];
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

  async function handleDel(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from && msg.from.id;
    if (msg.chat.type !== 'private') {
      return reply(chatId, 'Удалять персонажей — только в личке со мной. Напиши мне в ЛС: /del 1, /del 2 или /delall.', msg.message_id, msg.message_thread_id);
    }
    const record = await store.get(userId);
    const chars = charactersOf(record);
    if (!chars.length) {
      return reply(chatId, 'У тебя нет персонажей, удалять нечего.', msg.message_id, msg.message_thread_id);
    }
    // "/delall" (one word) is the same as "/del all": drop every character.
    const arg = commandOf(msg.text) === 'delall' ? 'all' : commandArgs(msg.text).toLowerCase();
    if (!arg) {
      return reply(chatId, ['Кого удалить? Напиши /del 1, /del 2 или /delall.', '', characterList(record)].join('\n'), msg.message_id, msg.message_thread_id);
    }
    let updated;
    if (arg === 'all' || arg === '*' || arg === 'все' || arg === 'всё') updated = removeCharacter(record, 'all');
    else if (/^\d+$/.test(arg)) updated = removeCharacter(record, Number(arg));
    else return reply(chatId, 'Не понял номер. Напиши /del 1, /del 2 или /delall.', msg.message_id, msg.message_thread_id);
    await store.set(userId, updated);
    const left = charactersOf(updated);
    const lines = [left.length ? '✅ Удалил. Осталось:' : '✅ Удалил всех персонажей.'];
    if (left.length) {
      lines.push('', characterList(updated), '', 'Чтобы записать заново — /reg Имя и статы.');
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
    const character = characterAt(record, 1) || charactersOf(record)[0] || null;

    if (answerCallback) await answerCallback(query.id);

    if (editMessage && chatId && messageId) {
      await editMessage(chatId, messageId, sectionText(key, character), menuKeyboard(active));
    }
    return undefined;
  }

  async function handleRules(msg) {
    return reply(msg.chat.id, sectionText('rules'), msg.message_id, msg.message_thread_id, menuKeyboard('rules'));
  }

  async function handlePost(msg) {
    return reply(msg.chat.id, sectionText('post'), msg.message_id, msg.message_thread_id, menuKeyboard('post'));
  }

  async function handleFeats(msg) {
    const record = await store.get(msg.from && msg.from.id);
    const slot = Number(commandArgs(msg.text)) || 1;
    const character = characterAt(record, slot) || charactersOf(record)[0] || null;
    return reply(msg.chat.id, sectionText('feats', character), msg.message_id, msg.message_thread_id, menuKeyboard('feats'));
  }

  async function handleMy(msg) {
    const record = await store.get(msg.from && msg.from.id);
    const chars = charactersOf(record);
    if (!chars.length) {
      return reply(msg.chat.id, 'Тебя ещё нет в списке. Напиши в ЛС /reg Имя и статы.', msg.message_id, msg.message_thread_id);
    }
    const blocks = chars.map((c) => characterText(c));
    return reply(msg.chat.id, ['📚 Твои персонажи:', '', blocks.join('\n\n')].join('\n'), msg.message_id, msg.message_thread_id);
  }

  async function handleStart(msg) {
    return reply(msg.chat.id, [
      'Я кидаю кубик для Deeprealm.',
      '',
      'В личке: /reg Имя @юзер и статы — записать персонажа (можно двух).',
      'В общем чате: закончи пост на /roll — и я выдам крит, блок и уклонение.',
      'Два персонажа? Укажи номер: /roll 1 или /roll 2.',
      '',
      'Меню: /menu — правила боя, пост в бою, фишки, кубик.',
      'Ещё: /my — мои листы, /del 1|2|delall — удалить персонажа.'
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
      if (cmd === 'del' || cmd === 'delete' || cmd === 'delall') return handleDel(msg);
      if (cmd === 'rules') return handleRules(msg);
      if (cmd === 'post') return handlePost(msg);
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
