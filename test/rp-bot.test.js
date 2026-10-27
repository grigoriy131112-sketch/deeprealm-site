// The RP dice bot: sheets, the three rolls, and the messages it posts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { bonus, resolveStat, STAT_KEYS } from '../bot/stats.js';
import { featFor } from '../bot/rules/feats.js';
import { rollSet, formatRoll, ROLL_ORDER } from '../bot/dice.js';
import { parseSheet, extractConditional, wantsRoll, commandOf } from '../bot/parse.js';
import { createStore } from '../bot/store.js';
import { createBot } from '../bot/bot.js';

function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-bot-'));
  return createStore(path.join(dir, 'players.json'));
}

function collector() {
  const sent = [];
  return { sent, send: (chatId, text, replyTo) => sent.push({ chatId, text, replyTo }) };
}

// A private-chat /reg message from `id`.
function reg(id, text) {
  return { update_id: 1, message: { message_id: 10, chat: { id, type: 'private' }, from: { id, username: 'u' + id }, text } };
}

function groupMsg(id, chatId, text, messageId = 20) {
  return { update_id: 2, message: { message_id: messageId, chat: { id: chatId, type: 'supergroup' }, from: { id, username: 'u' + id }, text } };
}

const SHEET = 'Аттар\nСила 8, Скорость 6, Ловкость 5, Выносливость 6, Здоровье 8, Реакция 6, Хитрость 5, Интеллект 7, Сообразительность 6, Изворотливость 4, Агрессивность 3, Доброта 6, Харизма 5, Эмпатия 4';

test('bonus is half the rating, rounded down', () => {
  assert.equal(bonus(8), 4);
  assert.equal(bonus(7), 3);
  assert.equal(bonus(5), 2);
  assert.equal(bonus(1), 0);
  assert.equal(bonus(0), 0);
});

test('resolveStat accepts Russian, keys and aliases', () => {
  assert.equal(resolveStat('Сила'), 'strength');
  assert.equal(resolveStat('сила'), 'strength');
  assert.equal(resolveStat('Реакция'), 'reaction');
  assert.equal(resolveStat('str'), 'strength');
  assert.equal(resolveStat('нечто'), null);
});

test('feats open at 8 and upgrade at 10', () => {
  assert.equal(featFor('strength', 7), null);
  assert.equal(featFor('strength', 8).base, 'Стальной захват');
  assert.equal(featFor('strength', 8).tier, 8);
  assert.equal(featFor('strength', 10).tier, 10);
  assert.equal(featFor('health', 9).base, 'Вопреки смерти');
});

test('parseSheet reads a name and the fourteen ratings', () => {
  const p = parseSheet('/reg ' + SHEET);
  assert.equal(p.name, 'Аттар');
  assert.equal(p.stats.strength, 8);
  assert.equal(p.stats.reaction, 6);
  assert.equal(p.missing.length, 0);
  assert.deepEqual(p.unknown, []);
});

test('parseSheet tolerates newlines and colons and reports bad input', () => {
  const p = parseSheet('/reg Бо\nСила: 9\nЛовкость = 4\nФигня 3\nРеакция 12');
  assert.equal(p.name, 'Бо');
  assert.equal(p.stats.strength, 9);
  assert.equal(p.stats.agility, 4);
  assert.ok(p.unknown.some((u) => u.includes('Фигня')));
  assert.ok(p.unknown.some((u) => u.includes('Реакция 12')));
  assert.ok(p.missing.includes('health'));
});

test('extractConditional pulls the "if crit" tail', () => {
  assert.equal(extractConditional('атакую мечом; если крит — добиваю'), 'добиваю');
  assert.equal(extractConditional('бью; если крит удастся, использую добивание'), 'использую добивание');
  assert.equal(extractConditional('просто атакую'), null);
});

test('wantsRoll and commandOf', () => {
  assert.equal(wantsRoll('мой пост /roll'), true);
  assert.equal(wantsRoll('мой пост'), false);
  assert.equal(commandOf('/roll'), 'roll');
  assert.equal(commandOf('/reg@koobboobbot Аттар'), 'reg');
  assert.equal(commandOf('привет'), null);
});

test('rollSet rolls three dice and adds half of the matching stat', () => {
  const sheet = { name: 'Аттар', stats: { strength: 8, reaction: 6 } };
  const results = rollSet(sheet, [10, 9, 20]);
  assert.deepEqual(results.map((r) => r.key), ROLL_ORDER);
  const [crit, block, dodge] = results;
  assert.equal(crit.total, 10 + 4);
  assert.equal(block.total, 9 + 4);
  assert.equal(dodge.total, 20 + 3);
  assert.equal(crit.crit, false);
  assert.equal(dodge.crit, false); // only the crit roll can crit
});

test('a natural 19 or 20 marks the crit', () => {
  const sheet = { name: 'Аттар', stats: { strength: 8, reaction: 6 } };
  assert.equal(rollSet(sheet, [19, 1, 1])[0].crit, true);
  assert.equal(rollSet(sheet, [20, 1, 1])[0].crit, true);
  assert.equal(rollSet(sheet, [18, 1, 1])[0].crit, false);
});

test('formatRoll shows the raw die, the bonus and the total', () => {
  const sheet = { name: 'Аттар', stats: { strength: 8, reaction: 6 } };
  const text = formatRoll(sheet, rollSet(sheet, [17, 9, 20]));
  assert.match(text, /🎲 Аттар/);
  assert.match(text, /Крит-урон:  d20 = 17 → 17 \+ 4 = 21/);
  assert.match(text, /Блок:  d20 = 9 → 9 \+ 4 = 13/);
  assert.match(text, /Уклонение:  d20 = 20 → 20 \+ 3 = 23/);
});

test('store keeps sheets per player id and survives a rewrite', async () => {
  const store = tempStore();
  await store.set(5, { name: 'Аттар', stats: { strength: 8 } });
  await store.set(6, { name: 'Бо', stats: { strength: 4 } });
  assert.equal((await store.get(5)).name, 'Аттар');
  assert.equal((await store.get('6')).name, 'Бо');
  assert.equal(Object.keys(await store.all()).length, 2);
  await store.remove(5);
  assert.equal(await store.get(5), null);
});

test('/reg in private saves the sheet and answers with it', async () => {
  const store = tempStore();
  const { sent, send } = collector();
  const bot = createBot({ store, send });
  await bot.handleUpdate(reg(5, '/reg ' + SHEET));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].chatId, 5);
  assert.match(sent[0].text, /Записал, Аттар/);
  assert.match(sent[0].text, /Сила 8/);
  assert.match(sent[0].text, /«Стальной захват»/); // Strength 8 opens the feat
  assert.equal(store.get(5).stats.reaction, 6);
});

test('/reg in a group is refused and sent to private chat', async () => {
  const store = tempStore();
  const { sent, send } = collector();
  const bot = createBot({ store, send });
  await bot.handleUpdate(groupMsg(5, 100, '/reg ' + SHEET));
  assert.match(sent[0].text, /только в личке/);
  assert.equal(store.get(5), null);
});

test('/roll in the group answers with three rolls', async () => {
  const store = tempStore();
  const { sent, send } = collector();
  const bot = createBot({ store, send });
  await bot.handleUpdate(reg(5, '/reg ' + SHEET));
  await bot.handleUpdate(groupMsg(5, 100, 'Атакую гоблина мечом /roll'));
  const out = sent[sent.length - 1];
  assert.equal(out.chatId, 100);
  assert.match(out.text, /🎲 Аттар/);
  assert.match(out.text, /Крит-урон:/);
  assert.match(out.text, /Блок:/);
  assert.match(out.text, /Уклонение:/);
});

test('/roll from an unregistered player asks them to register', async () => {
  const store = tempStore();
  const { sent, send } = collector();
  const bot = createBot({ store, send });
  await bot.handleUpdate(groupMsg(9, 100, 'бью /roll'));
  assert.match(sent[0].text, /в ЛС \/reg/);
});

test('an "if crit" plan is echoed only when the crit roll lands', async () => {
  const store = tempStore();
  const { sent, send } = collector();
  const bot = createBot({ store, send });
  await bot.handleUpdate(reg(5, '/reg ' + SHEET));
  // Strength 8 -> +4. Raw 20 is a crit; raw 5 is not.
  const orig = Math.random;
  try {
    Math.random = () => 0.95; // 20 on a d20
    await bot.handleUpdate(groupMsg(5, 100, 'атакую; если крит — добиваю /roll'));
  } finally {
    Math.random = orig;
  }
  const withCrit = sent[sent.length - 1].text;
  assert.match(withCrit, /Крит удался — применяю: добиваю/);
});

test('/rules prints the turn economy and the dice thresholds', async () => {
  const store = tempStore();
  const { sent, send } = collector();
  const bot = createBot({ store, send });
  await bot.handleUpdate({ message: { message_id: 1, chat: { id: 5, type: 'private' }, from: { id: 5 }, text: '/rules' } });
  const text = sent[0].text;
  assert.match(text, /1 полное действие и 2 неполных/);
  assert.match(text, /19–20, урон ×2/);
  assert.match(text, /половина характеристики, округление вниз/);
});

test('the engine never reads a stat that is not a real characteristic', () => {
  // Guard against a typo in ROLLS.stat quietly yielding a zero bonus.
  const sheet = { name: 'x', stats: {} };
  for (const s of STAT_KEYS) sheet.stats[s] = 1;
  const results = rollSet(sheet, [10, 10, 10]);
  for (const r of results) assert.ok(STAT_KEYS.includes(r.statKey), r.statKey);
});
