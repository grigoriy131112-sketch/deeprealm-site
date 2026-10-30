// The RP dice bot: sheets, the three rolls, and the messages it posts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { bonus, resolveStat, STAT_KEYS, distributionIssues, STAT_BLOCKS, DISTRIBUTION_RULE } from '../bot/stats.js';
import { featFor } from '../bot/rules/feats.js';
import { rollSet, formatRoll, ROLL_ORDER } from '../bot/dice.js';
import { diceText } from '../bot/menu.js';
import { parseSheet, extractConditional, wantsRoll, commandOf, rollCommand, commandArgs } from '../bot/parse.js';
import { createStore } from '../bot/store.js';
import { createBot } from '../bot/bot.js';
import { charactersOf, characterAt, addCharacter, removeCharacter, normalizeRecord, MAX_CHARACTERS } from '../bot/characters.js';

function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-bot-'));
  return createStore(path.join(dir, 'players.json'));
}

function collector() {
  const sent = [];
  const edited = [];
  const answered = [];
  const deleted = [];
  let seq = 100;
  return {
    sent,
    edited,
    answered,
    deleted,
    send: (chatId, text, replyTo, threadId, keyboard) => {
      const messageId = ++seq;
      sent.push({ chatId, text, replyTo, threadId, keyboard, messageId });
      return { ok: true, messageId };
    },
    editMessage: (chatId, messageId, text, keyboard) => edited.push({ chatId, messageId, text, keyboard }),
    answerCallback: (id) => answered.push(id),
    deleteMessage: (chatId, messageId) => deleted.push({ chatId, messageId })
  };
}

// A private-chat /reg message from `id`.
function reg(id, text) {
  return { update_id: 1, message: { message_id: 10, chat: { id, type: 'private' }, from: { id, username: 'u' + id }, text } };
}

function groupMsg(id, chatId, text, messageId = 20) {
  return { update_id: 2, message: { message_id: messageId, chat: { id: chatId, type: 'supergroup' }, from: { id, username: 'u' + id }, text } };
}

const SHEET = 'Аттар\nСила 8, Скорость 6, Ловкость 5, Выносливость 6, Здоровье 5, Реакция 6, Хитрость 5, Интеллект 7, Сообразительность 6, Изворотливость 4, Агрессивность 3, Доброта 6, Харизма 5, Эмпатия 4';

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

test('a feat opens only at a rating of 10', () => {
  assert.equal(featFor('strength', 7), null);
  assert.equal(featFor('strength', 8), null);
  assert.equal(featFor('strength', 9), null);
  assert.equal(featFor('strength', 10).name, 'Стальной захват');
  assert.equal(featFor('strength', 10).tier, 10);
  assert.equal(featFor('health', 10).name, 'Вопреки смерти');
});

test('parseSheet reads a name and the fourteen ratings', () => {
  const p = parseSheet('/reg ' + SHEET);
  assert.equal(p.name, 'Аттар');
  assert.equal(p.user, '');
  assert.equal(p.stats.strength, 8);
  assert.equal(p.stats.reaction, 6);
  assert.equal(p.missing.length, 0);
  assert.deepEqual(p.unknown, []);
});

test('parseSheet keeps an @user handle on the name line', () => {
  const p = parseSheet('/reg Аттар @attar\nСила 8, Реакция 6');
  assert.equal(p.name, 'Аттар');
  assert.equal(p.user, 'attar');
  assert.equal(p.stats.strength, 8);
});

test('rollCommand reads the glued roll command, and a bare /roll does not roll', () => {
  assert.deepEqual(rollCommand('/roll1'), { slot: 1, all: false });
  assert.deepEqual(rollCommand('бью /roll2'), { slot: 2, all: false });
  assert.deepEqual(rollCommand('/rollall'), { slot: null, all: true });
  assert.deepEqual(rollCommand('за обоих /rollall'), { slot: null, all: true });
  assert.deepEqual(rollCommand('/roll1@koobboobbot'), { slot: 1, all: false });
  // The three commands only: a bare /roll and a spaced /roll 1 are not rolls.
  assert.equal(rollCommand('бью /roll'), null);
  assert.equal(rollCommand('/roll 2'), null);
  assert.equal(rollCommand('без броска'), null);
  assert.equal(commandArgs('/del 1'), '1');
  assert.equal(commandArgs('/del@koobboobbot all'), 'all');
  assert.equal(commandArgs('/feats 2'), '2');
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

test('distributionIssues flags two ratings above 6 in one block', () => {
  assert.match(DISTRIBUTION_RULE, /один показатель на 10, один на 9, один на 8, один на 7/);
  // One 10, one 9, one 8, one 7 per block is fine.
  const ok = { strength: 10, speed: 9, agility: 8, stamina: 7, health: 5, reaction: 4 };
  assert.deepEqual(distributionIssues(ok, STAT_BLOCKS.physical), []);
  // A second 8 breaks it.
  const bad = { strength: 10, speed: 9, agility: 8, stamina: 8, health: 5, reaction: 4 };
  const issues = distributionIssues(bad, STAT_BLOCKS.physical);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rating, 8);
  assert.deepEqual(issues[0].names, ['Ловкость', 'Выносливость']);
  // An incomplete block is not judged.
  assert.deepEqual(distributionIssues({ strength: 10, speed: 10 }, STAT_BLOCKS.physical), []);
});

test('/reg warns when a block breaks the distribution rule', async () => {
  const store = tempStore();
  const { sent, send } = collector();
  const bot = createBot({ store, send });
  await bot.handleUpdate(reg(5, '/reg Два\nСила 10, Скорость 9, Ловкость 8, Выносливость 8, Здоровье 5, Реакция 4'));
  const text = sent[sent.length - 1].text;
  assert.match(text, /Нарушено правило характеристик/);
  assert.match(text, /Ловкость, Выносливость — по 8 может быть только одна/);
});

test('extractConditional pulls the "if crit" tail', () => {
  assert.equal(extractConditional('атакую мечом; если крит — добиваю'), 'добиваю');
  assert.equal(extractConditional('бью; если крит удастся, использую добивание'), 'использую добивание');
  // "если выпал крит. Урон, использую <заклинание>" is the wording the menu shows.
  assert.equal(
    extractConditional('атакую; если выпал крит. Урон, использую ваше заклинание'),
    'Урон, использую ваше заклинание'
  );
  // The trailing roll command is not part of the plan.
  assert.equal(extractConditional('атакую; если крит — добиваю /roll1'), 'добиваю');
  assert.equal(
    extractConditional('атакую; если выпал крит. Урон, использую ваше заклинание /roll2'),
    'Урон, использую ваше заклинание'
  );
  assert.equal(extractConditional('просто атакую'), null);
});

test('wantsRoll and commandOf', () => {
  assert.equal(wantsRoll('мой пост /roll1'), true);
  assert.equal(wantsRoll('мой пост /rollall'), true);
  // A bare or spaced /roll is not a valid roll, but still reaches handleRoll
  // so the player gets a hint instead of silence.
  assert.equal(wantsRoll('мой пост /roll'), true);
  assert.equal(wantsRoll('мой пост /roll 2'), true);
  assert.equal(wantsRoll('мой пост'), false);
  assert.equal(commandOf('/roll1'), 'roll');
  assert.equal(commandOf('/roll2'), 'roll');
  assert.equal(commandOf('/rollall'), 'rollall');
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

test('a crit total of 19 or 20 marks the crit', () => {
  const sheet = { name: 'Аттар', stats: { strength: 8, reaction: 6 } };
  // Strength 8 -> +4, so the threshold is read on the total.
  assert.equal(rollSet(sheet, [15, 1, 1])[0].crit, true); // 19
  assert.equal(rollSet(sheet, [16, 1, 1])[0].crit, true); // 20
  assert.equal(rollSet(sheet, [14, 1, 1])[0].crit, false); // 18
  // Only the crit roll can crit.
  assert.equal(rollSet(sheet, [20, 1, 1])[1].crit, false);
});

test('crit bands: 0-5 fumble, 6-9 miss, 10-12 half, 13-18 hit, 19-20 crit', () => {
  const sheet = { name: 'Аттар', stats: { strength: 8, reaction: 6 } }; // +4
  const band = (raw) => {
    const c = rollSet(sheet, [raw, 1, 1])[0];
    if (c.crit) return 'crit';
    if (c.fumble) return 'fumble';
    if (c.miss) return 'miss';
    if (c.half) return 'half';
    if (c.hit) return 'hit';
    return '?';
  };
  // total = raw + 4
  assert.equal(band(0), 'fumble'); // 4
  assert.equal(band(1), 'fumble'); // 5
  assert.equal(band(2), 'miss');   // 6
  assert.equal(band(5), 'miss');   // 9
  assert.equal(band(6), 'half');   // 10
  assert.equal(band(8), 'half');   // 12
  assert.equal(band(9), 'hit');    // 13
  assert.equal(band(14), 'hit');   // 18
  assert.equal(band(15), 'crit');  // 19
  assert.equal(band(16), 'crit');  // 20
  // Only the crit roll carries these bands.
  const dodge = rollSet(sheet, [1, 1, 1])[2];
  assert.equal(dodge.fumble, false);
  assert.equal(dodge.miss, false);
  assert.equal(dodge.half, false);
  assert.equal(dodge.hit, false);
});

test('an 11-total crit roll is half damage, not a fumble', () => {
  // Strength 6 -> +3. Raw 8 totals 11, which is the 10-12 half-damage band.
  const sheet = { name: 'Грин', stats: { strength: 6, reaction: 4 } };
  const [crit] = rollSet(sheet, [8, 7, 8]);
  assert.equal(crit.total, 11);
  assert.equal(crit.half, true);
  assert.equal(crit.fumble, false);
  assert.equal(crit.miss, false);
  assert.equal(crit.hit, false);
});

test('formatRoll names each crit band in the roll message', () => {
  const sheet = { name: 'Аттар', stats: { strength: 8, reaction: 6 } }; // +4
  const line = (raw) => formatRoll(sheet, rollSet(sheet, [raw, 9, 20])).split('\n')[1];
  assert.match(line(0), /d21 = 0 → 0 \+ 4 = 4  ⚠️ промах \(\+5 по тебе\)/);
  assert.match(line(3), /d21 = 3 → 3 \+ 4 = 7  ⚠️ промах$/);
  assert.match(line(7), /d21 = 7 → 7 \+ 4 = 11  ➗ половина урона/);
  assert.match(line(10), /d21 = 10 → 10 \+ 4 = 14  ✅ обычная атака/);
  assert.match(line(15), /d21 = 15 → 15 \+ 4 = 19  💥 КРИТ/);
});

test('formatRoll labels an ordinary hit between fumble and crit', () => {
  const sheet = { name: 'Грин', stats: { strength: 6, reaction: 4 } };
  const text = formatRoll(sheet, rollSet(sheet, [13, 7, 8]));
  assert.match(text, /Крит-урон:  d21 = 13 → 13 \+ 3 = 16  ✅ обычная атака/);
});

test('formatRoll shows the raw die, the bonus and the total', () => {
  const sheet = { name: 'Аттар', stats: { strength: 8, reaction: 6 } };
  const text = formatRoll(sheet, rollSet(sheet, [17, 9, 20]));
  assert.match(text, /🎲 Аттар/);
  assert.match(text, /Крит-урон:  d21 = 17 → 17 \+ 4 = 21  💥 КРИТ/);
  assert.match(text, /Блок:  d21 = 9 → 9 \+ 4 = 13/);
  assert.match(text, /Уклонение:  d21 = 20 → 20 \+ 3 = 23  🛡️ уклонение удалось/);
});

test('a dodge failure states its result instead of printing nothing', () => {
  // The owner asked for both dodge bands to be written. A failed dodge used to
  // print a bare total with no outcome, which read as "nothing happened".
  const sheet = { name: 'Грин', stats: { strength: 6, reaction: 4 } };
  const text = formatRoll(sheet, rollSet(sheet, [8, 7, 5]));
  assert.match(text, /Уклонение:  d21 = 5 → 5 \+ 2 = 7  ⚠️ уклонение не удалось — урон полный/);
  // And a success still says so.
  const ok = formatRoll(sheet, rollSet(sheet, [8, 7, 15]));
  assert.match(ok, /Уклонение:  d21 = 15 → 15 \+ 2 = 17  🛡️ уклонение удалось — атака промахнулась \(урон 0\)/);
});

test('every block band states its result', () => {
  const sheet = { name: 'Аттар', stats: { strength: 8, reaction: 6 } };
  // +4, so totals 13 / 17 / 21 read as fail / partial / full.
  assert.match(formatRoll(sheet, rollSet(sheet, [17, 9, 20])), /Блок:  d21 = 9 → 9 \+ 4 = 13  ⚠️ блок не удался — урон полный/);
  assert.match(formatRoll(sheet, rollSet(sheet, [17, 13, 20])), /Блок:  d21 = 13 → 13 \+ 4 = 17  🛡️ блок частичный — урон пополам/);
  assert.match(formatRoll(sheet, rollSet(sheet, [17, 17, 20])), /Блок:  d21 = 17 → 17 \+ 4 = 21  🛡️ блок полный — урон 0 \(если есть щит; без щита — урон пополам\)/);
});

test('a strong sheet blocks first and skips the dodge when the block holds', () => {
  const sheet = { name: 'Грин', stats: { strength: 8, reaction: 4 } }; // +4 vs +2
  // Block total 17 is a partial success, so the dodge is not rolled.
  const held = formatRoll(sheet, rollSet(sheet, [4, 13, 15]));
  assert.match(held, /Блок:  d21 = 13 → 13 \+ 4 = 17  🛡️ блок частичный/);
  assert.doesNotMatch(held, /Уклонение/);
  // A full block skips it too.
  const full = formatRoll(sheet, rollSet(sheet, [4, 17, 15]));
  assert.match(full, /Блок:  d21 = 17 → 17 \+ 4 = 21  🛡️ блок полный/);
  assert.doesNotMatch(full, /Уклонение/);
});

test('a nimble sheet dodges first and skips the block when the dodge holds', () => {
  const sheet = { name: 'Лиса', stats: { strength: 4, reaction: 8 } }; // +2 vs +4
  const held = formatRoll(sheet, rollSet(sheet, [4, 15, 10]));
  assert.match(held, /Уклонение:  d21 = 15 → 15 \+ 4 = 19  🛡️ уклонение удалось/);
  assert.doesNotMatch(held, /Блок/);
});

test('the second defence appears only when the first one fails', () => {
  // Strong sheet: block fails, so the dodge is rolled as the second chance.
  const strong = { name: 'Грин', stats: { strength: 8, reaction: 4 } };
  const s = formatRoll(strong, rollSet(strong, [4, 5, 15]));
  assert.match(s, /Блок:  d21 = 5 → 5 \+ 4 = 9  ⚠️ блок не удался/);
  assert.match(s, /Уклонение:  d21 = 15 → 15 \+ 2 = 17  🛡️ уклонение удалось — атака промахнулась \(урон 0\)/);
  // Nimble sheet: dodge fails, so the block is rolled as the second chance.
  const nimble = { name: 'Лиса', stats: { strength: 4, reaction: 8 } };
  const n = formatRoll(nimble, rollSet(nimble, [4, 5, 17]));
  assert.match(n, /Уклонение:  d21 = 5 → 5 \+ 4 = 9  ⚠️ уклонение не удалось — урон полный/);
  assert.match(n, /Блок:  d21 = 17 → 17 \+ 2 = 19  🛡️ блок полный/);
});

test('the /menu dice help names every crit band and the block/dodge failure band', () => {
  const text = diceText();
  assert.match(text, /Крит-урон — от Силы\. 0–5 — промах, по тебе \+5/);
  assert.match(text, /6–9 — промах/);
  assert.match(text, /10–12 — половина урона/);
  assert.match(text, /13–18 — обычная атака/);
  assert.match(text, /19–20 — крит \(урон ×2\)/);
  assert.match(text, /Блок — от Силы\. 18–20 полный/);
  assert.match(text, /0–15 — блок не удался/);
  assert.match(text, /Уклонение — от Реакции\. 16–20 — успех/);
  assert.match(text, /0–15 — не удалось/);
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
  assert.match(sent[0].text, /Записал персонажа 1: Аттар/);
  assert.match(sent[0].text, /Сила 8/);
  assert.doesNotMatch(sent[0].text, /«Стальной захват»/); // a rating of 8 no longer opens a feat
  const record = await store.get(5);
  assert.equal(characterAt(record, 1).stats.reaction, 6);
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
  await bot.handleUpdate(groupMsg(5, 100, 'Атакую гоблина мечом /roll1'));
  const out = sent[sent.length - 1];
  assert.equal(out.chatId, 100);
  assert.match(out.text, /🎲 Аттар/);
  assert.match(out.text, /Крит-урон:/);
  // Defence is a chain: the higher bonus leads (here Strength, so block), and the
  // dodge appears only when the block fails. At least one defence is always rolled.
  assert.match(out.text, /Блок:|Уклонение:/);
});

test('/roll from an unregistered player asks them to register', async () => {
  const store = tempStore();
  const { sent, send } = collector();
  const bot = createBot({ store, send });
  await bot.handleUpdate(groupMsg(9, 100, 'бью /roll1'));
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
    Math.random = () => 0.99; // 20 on the 0-20 die (21 faces)
    await bot.handleUpdate(groupMsg(5, 100, 'атакую; если выпал крит. Урон, использую ваше заклинание /roll1'));
  } finally {
    Math.random = orig;
  }
  const withCrit = sent[sent.length - 1].text;
  assert.match(withCrit, /Крит удался — применяю: Урон, использую ваше заклинание/);
  // The roll command is not echoed back as part of the plan.
  assert.doesNotMatch(withCrit, /ваше заклинание \/roll1/);
});

test('/rules prints the turn economy and the dice thresholds', async () => {
  const store = tempStore();
  const { sent, send } = collector();
  const bot = createBot({ store, send });
  await bot.handleUpdate({ message: { message_id: 1, chat: { id: 5, type: 'private' }, from: { id: 5 }, text: '/rules' } });
  const text = sent[0].text;
  assert.match(text, /атака и 2 неполных действия/);
  assert.match(text, /без атаки — 3 неполных действия/);
  assert.match(text, /19–20 — крит, урон ×2/);
  assert.match(text, /0–5 — промах, по тебе \+5/);
  assert.match(text, /10–12 — половина урона/);
  assert.match(text, /13–18 — обычная атака/);
  assert.match(text, /половина характеристики, округление вниз/);
  // Defence is a chain: the higher bonus goes first, the second only on a fail.
  assert.match(text, /Защита — цепочка/);
  assert.match(text, /сначала та, у которой выше бонус/);
  assert.match(text, /Вторая защита бросается только если первая не удалась/);
  // The player rolls their own defence, in the same command - not a separate
  // defender.
  assert.doesNotMatch(text, /Защитник бросает/);
});

test('the engine never reads a stat that is not a real characteristic', () => {
  // Guard against a typo in ROLLS.stat quietly yielding a zero bonus.
  const sheet = { name: 'x', stats: {} };
  for (const s of STAT_KEYS) sheet.stats[s] = 1;
  const results = rollSet(sheet, [10, 10, 10]);
  for (const r of results) assert.ok(STAT_KEYS.includes(r.statKey), r.statKey);
});

test('/menu posts the home screen with the section keyboard', async () => {
  const store = tempStore();
  const c = collector();
  const bot = createBot({ store, send: c.send, editMessage: c.editMessage, answerCallback: c.answerCallback });
  await bot.handleUpdate({ message: { message_id: 1, chat: { id: 5, type: 'private' }, from: { id: 5 }, text: '/menu' } });
  assert.equal(c.sent.length, 1);
  const kb = c.sent[0].keyboard;
  assert.ok(kb && kb.inline_keyboard, 'menu must carry an inline keyboard');
  const datas = kb.inline_keyboard.flat().map((b) => b.callback_data);
  assert.deepEqual(datas, ['menu:rules', 'menu:post', 'menu:feats', 'menu:dice']);
});

test('/rules mentions mana and that skipping a turn restores 5', async () => {
  const store = tempStore();
  const c = collector();
  const bot = createBot({ store, send: c.send, editMessage: c.editMessage, answerCallback: c.answerCallback });
  await bot.handleUpdate({ message: { message_id: 1, chat: { id: 5, type: 'private' }, from: { id: 5 }, text: '/rules' } });
  const text = c.sent[0].text;
  assert.match(text, /атака и 2 неполных действия/);
  assert.match(text, /без атаки — 3 неполных действия/);
  assert.match(text, /19–20 — крит, урон ×2/);
  assert.match(text, /Мана/);
  assert.match(text, /Пропуск атаки восстанавливает 5 маны/);
});

test('/delall removes every character, same as /del all', async () => {
  const store = tempStore();
  const { sent, send } = collector();
  const bot = createBot({ store, send });
  await bot.handleUpdate(reg(5, '/reg Аттар\nСила 8'));
  await bot.handleUpdate(reg(5, '/reg Бо\nСила 4'));
  await bot.handleUpdate(reg(5, '/delall'));
  assert.equal(charactersOf(await store.get(5)).length, 0);
  assert.match(sent[sent.length - 1].text, /Удалил всех/);
  // A third registration starts over from slot 1.
  await bot.handleUpdate(reg(5, '/reg Ворон\nСила 6'));
  assert.equal(characterAt(await store.get(5), 1).name, 'Ворон');
});

test('/feats lists every characteristic and the player\'s own', async () => {
  const store = tempStore();
  await store.set(5, { name: 'Аттар', stats: { strength: 10, reaction: 6 } });
  const c = collector();
  const bot = createBot({ store, send: c.send, editMessage: c.editMessage, answerCallback: c.answerCallback });
  await bot.handleUpdate({ message: { message_id: 1, chat: { id: 5, type: 'private' }, from: { id: 5 }, text: '/feats' } });
  const text = c.sent[0].text;
  assert.match(text, /Стальной захват/);
  assert.match(text, /Мгновенный рывок/);
  assert.match(text, /Твои открытые/);
  assert.match(text, /только на характеристику 10/);
  // Every feat now carries the owner's narration, its numbers, and the rating
  // the narration needs where there is one.
  assert.match(text, /Нарратив: Выбивание дверей/);
  assert.match(text, /Математика: \+2 к урону в ближнем бою/);
  assert.match(text, /Математика: Максимальное ХП = Здоровье × 10/);
  // Characteristics with no numbers still say so, so the block never goes blank.
  assert.match(text, /Математика: нет\./);
  assert.match(text, /Нарратив: Ложь, манипуляции/);
  assert.match(text, /Стальной захват» \(мин\. 6\)/);
  assert.match(text, /Кошачий баланс» \(мин\. 6\)/);
  assert.match(text, /Отражение» \(мин\. 6\)/);
});

test('/feats opens nothing at 8 or 9', async () => {
  const store = tempStore();
  await store.set(5, { name: 'Аттар', stats: { strength: 9, reaction: 8 } });
  const c = collector();
  const bot = createBot({ store, send: c.send, editMessage: c.editMessage, answerCallback: c.answerCallback });
  await bot.handleUpdate({ message: { message_id: 1, chat: { id: 5, type: 'private' }, from: { id: 5 }, text: '/feats' } });
  const text = c.sent[0].text;
  assert.match(text, /пока нет — нужна характеристика 10/);
});

test('a menu button edits a short section in place and answers the callback', async () => {
  const store = tempStore();
  const c = collector();
  const bot = createBot({ store, send: c.send, editMessage: c.editMessage, answerCallback: c.answerCallback, deleteMessage: c.deleteMessage });
  await bot.handleUpdate({
    callback_query: {
      id: 'cb-1',
      from: { id: 5 },
      data: 'menu:dice',
      message: { message_id: 42, chat: { id: 5, type: 'private' } }
    }
  });
  assert.deepEqual(c.answered, ['cb-1'], 'the button spinner must be stopped');
  assert.equal(c.edited.length, 1);
  assert.equal(c.edited[0].messageId, 42);
  assert.match(c.edited[0].text, /Кубик/);
  assert.match(c.edited[0].text, /\/roll/);
  assert.equal(c.deleted.length, 0, 'a one-message section needs no cleanup');
  // The keyboard shows the open section and offers a way back.
  const datas = c.edited[0].keyboard.inline_keyboard.flat().map((b) => b.callback_data);
  assert.ok(datas.includes('menu:home'));
});

test('/feats is longer than one message, so it is split, first part keeps the menu', async () => {
  const store = tempStore();
  const c = collector();
  const bot = createBot({ store, send: c.send, editMessage: c.editMessage, answerCallback: c.answerCallback, deleteMessage: c.deleteMessage });
  await bot.handleUpdate({ message: { message_id: 1, chat: { id: 5, type: 'private' }, from: { id: 5 }, text: '/feats' } });
  assert.ok(c.sent.length >= 2, 'the feats do not fit in one Telegram message');
  for (const part of c.sent) assert.ok(part.text.length <= 3800, 'every part must fit Telegram');
  // The keyboard rides on the first part only, or the tail would double the buttons.
  assert.ok(c.sent[0].keyboard && c.sent[0].keyboard.inline_keyboard, 'first part carries the menu');
  assert.ok(c.sent.slice(1).every((p) => !p.keyboard), 'later parts carry no keyboard');
  // Every characteristic is present across the parts.
  const all = c.sent.map((p) => p.text).join('\n');
  for (const ru of ['Сила', 'Скорость', 'Ловкость', 'Выносливость', 'Здоровье', 'Реакция', 'Хитрость', 'Интеллект', 'Сообразительность', 'Изворотливость', 'Агрессивность', 'Доброта', 'Харизма', 'Эмпатия']) {
    assert.match(all, new RegExp(`• ${ru} —`));
  }
});

test('a menu button for a section too long to edit sends it and removes the old message', async () => {
  const store = tempStore();
  const c = collector();
  const bot = createBot({ store, send: c.send, editMessage: c.editMessage, answerCallback: c.answerCallback, deleteMessage: c.deleteMessage });
  await bot.handleUpdate({
    callback_query: { id: 'cb-feats', from: { id: 5 }, data: 'menu:feats', message: { message_id: 42, chat: { id: 5, type: 'private' } } }
  });
  assert.deepEqual(c.answered, ['cb-feats']);
  assert.equal(c.edited.length, 0, 'the feats cannot be edited in place - Telegram rejects >4096');
  assert.ok(c.deleted.some((d) => d.messageId === 42), 'the old menu message is removed');
  assert.ok(c.sent.length >= 2, 'the section is sent in parts');
  assert.ok(c.sent[0].keyboard && c.sent[0].keyboard.inline_keyboard, 'first part carries the menu');
});

test('switching away from the feats clears the tail, not just the head', async () => {
  const store = tempStore();
  const c = collector();
  const bot = createBot({ store, send: c.send, editMessage: c.editMessage, answerCallback: c.answerCallback, deleteMessage: c.deleteMessage });
  // Open the feats: two messages, the keyboard on the first.
  await bot.handleUpdate({
    callback_query: { id: 'cb-1', from: { id: 5 }, data: 'menu:feats', message: { message_id: 42, chat: { id: 5, type: 'private' } } }
  });
  const ids = c.sent.map((m) => m.messageId);
  assert.ok(ids.length >= 2, 'the feats went out in parts');
  const tail = ids.slice(1);
  c.deleted.length = 0;
  // Press a button on the first part to switch to another section.
  await bot.handleUpdate({
    callback_query: { id: 'cb-2', from: { id: 5 }, data: 'menu:dice', message: { message_id: ids[0], chat: { id: 5, type: 'private' } } }
  });
  for (const id of tail) {
    assert.ok(c.deleted.some((d) => d.messageId === id), `tail message ${id} must be deleted, not left behind`);
  }
  assert.equal(c.edited.length, 1, 'the short section replaces the head in place');
  assert.equal(c.edited[0].messageId, ids[0]);
});

test('the back button returns to the home screen', async () => {
  const store = tempStore();
  const c = collector();
  const bot = createBot({ store, send: c.send, editMessage: c.editMessage, answerCallback: c.answerCallback });
  await bot.handleUpdate({
    callback_query: { id: 'cb-2', from: { id: 5 }, data: 'menu:home', message: { message_id: 7, chat: { id: 5, type: 'private' } } }
  });
  assert.equal(c.edited.length, 1);
  assert.match(c.edited[0].text, /Выбери раздел/);
  const datas = c.edited[0].keyboard.inline_keyboard.flat().map((b) => b.callback_data);
  assert.ok(!datas.includes('menu:home'), 'home has no back row');
});

// --- two characters per account -------------------------------------------

test('normalizeRecord lifts a pre-multi-character sheet into slot 1', () => {
  const rec = normalizeRecord({ id: '5', name: 'Аттар', stats: { strength: 8 }, tgUser: 'attar' });
  assert.equal(rec.characters.length, 1);
  assert.equal(rec.characters[0].slot, 1);
  assert.equal(rec.characters[0].name, 'Аттар');
  assert.equal(rec.characters[0].stats.strength, 8);
  assert.equal(rec.characters[0].user, 'attar');
});

test('addCharacter fills slot 1 then slot 2 and refuses a third', () => {
  let rec = addCharacter(null, { name: 'Аттар' });
  assert.equal(charactersOf(rec).length, 1);
  assert.equal(characterAt(rec, 1).name, 'Аттар');
  rec = addCharacter(rec, { name: 'Бо' });
  assert.equal(characterAt(rec, 2).name, 'Бо');
  assert.equal(charactersOf(rec).length, MAX_CHARACTERS);
  const same = addCharacter(rec, { name: 'Третий' });
  assert.equal(charactersOf(same).length, MAX_CHARACTERS, 'no third character');
});

test('removeCharacter drops one slot or all of them', () => {
  let rec = addCharacter(addCharacter(null, { name: 'Аттар' }), { name: 'Бо' });
  rec = removeCharacter(rec, 1);
  assert.equal(charactersOf(rec).length, 1);
  assert.equal(characterAt(rec, 2).name, 'Бо', 'the other slot keeps its number');
  rec = removeCharacter(rec, 'all');
  assert.equal(charactersOf(rec).length, 0);
});

test('a second /reg stores a second character and caps at two', async () => {
  const store = tempStore();
  const { sent, send } = collector();
  const bot = createBot({ store, send });
  await bot.handleUpdate(reg(5, '/reg ' + SHEET));
  await bot.handleUpdate(reg(5, '/reg Бо\nСила 4, Реакция 7'));
  assert.match(sent[1].text, /Записал персонажа 2: Бо/);
  const rec = await store.get(5);
  assert.equal(charactersOf(rec).length, 2);
  // A third is refused, not silently overwritten.
  await bot.handleUpdate(reg(5, '/reg Третий\nСила 5'));
  assert.match(sent[2].text, /уже 2 персонажа/);
  assert.equal(charactersOf(await store.get(5)).length, 2);
});

test('/roll1 and /roll2 roll the named character', async () => {
  const store = tempStore();
  const { sent, send } = collector();
  const bot = createBot({ store, send });
  await bot.handleUpdate(reg(5, '/reg Аттар\nСила 8, Реакция 6'));
  await bot.handleUpdate(reg(5, '/reg Бо\nСила 4, Реакция 2'));
  await bot.handleUpdate(groupMsg(5, 100, 'бью /roll2'));
  assert.match(sent[sent.length - 1].text, /🎲 Бо #2/);
  await bot.handleUpdate(groupMsg(5, 100, 'бью /roll1'));
  assert.match(sent[sent.length - 1].text, /🎲 Аттар #1/);
});

test('/rollall rolls both characters in one message', async () => {
  const store = tempStore();
  const { sent, send } = collector();
  const bot = createBot({ store, send });
  await bot.handleUpdate(reg(5, '/reg Аттар\nСила 8, Реакция 6'));
  await bot.handleUpdate(reg(5, '/reg Бо\nСила 4, Реакция 2'));
  await bot.handleUpdate(groupMsg(5, 100, 'атакую за обоих /rollall'));
  const text = sent[sent.length - 1].text;
  assert.match(text, /🎲 Аттар #1/);
  assert.match(text, /🎲 Бо #2/);
  // One answer, not two: both blocks ride in the same message.
  assert.equal(sent.filter((m) => m.chatId === 100 && /🎲/.test(m.text)).length, 1);
});

test('/rollall with one character rolls just that one', async () => {
  const store = tempStore();
  const { sent, send } = collector();
  const bot = createBot({ store, send });
  await bot.handleUpdate(reg(5, '/reg Аттар\nСила 8, Реакция 6'));
  await bot.handleUpdate(groupMsg(5, 100, '/rollall'));
  const text = sent[sent.length - 1].text;
  assert.match(text, /🎲 Аттар #1/);
  assert.doesNotMatch(text, /#2/);
});

test('a bare /roll does not roll and asks which character', async () => {
  const store = tempStore();
  const { sent, send } = collector();
  const bot = createBot({ store, send });
  await bot.handleUpdate(reg(5, '/reg Аттар\nСила 8, Реакция 6'));
  await bot.handleUpdate(reg(5, '/reg Бо\nСила 4, Реакция 2'));
  await bot.handleUpdate(groupMsg(5, 100, 'атакую /roll'));
  const text = sent[sent.length - 1].text;
  assert.doesNotMatch(text, /🎲/);
  assert.match(text, /\/roll1, \/roll2 или \/rollall/);
});

test('a spaced /roll 2 does not roll either', async () => {
  const store = tempStore();
  const { sent, send } = collector();
  const bot = createBot({ store, send });
  await bot.handleUpdate(reg(5, '/reg Аттар\nСила 8, Реакция 6'));
  await bot.handleUpdate(groupMsg(5, 100, 'бью /roll 2'));
  const text = sent[sent.length - 1].text;
  assert.doesNotMatch(text, /🎲/);
  assert.match(text, /\/roll1, \/roll2 или \/rollall/);
});

test('/roll2 for a slot the player does not have says which exist', async () => {
  const store = tempStore();
  const { sent, send } = collector();
  const bot = createBot({ store, send });
  await bot.handleUpdate(reg(5, '/reg Аттар\nСила 8, Реакция 6'));
  await bot.handleUpdate(groupMsg(5, 100, 'бью /roll2'));
  assert.match(sent[sent.length - 1].text, /нет персонажа 2/);
});

test('/del 1 removes one character and /delall removes the rest', async () => {
  const store = tempStore();
  const { sent, send } = collector();
  const bot = createBot({ store, send });
  await bot.handleUpdate(reg(5, '/reg Аттар\nСила 8'));
  await bot.handleUpdate(reg(5, '/reg Бо\nСила 4'));
  await bot.handleUpdate(reg(5, '/del 1'));
  assert.match(sent[sent.length - 1].text, /Удалил/);
  assert.equal(characterAt(await store.get(5), 2).name, 'Бо');
  await bot.handleUpdate(reg(5, '/delall'));
  assert.equal(charactersOf(await store.get(5)).length, 0);
  // With no characters left, a roll asks them to register again.
  await bot.handleUpdate(groupMsg(5, 100, 'бью /roll1'));
  assert.match(sent[sent.length - 1].text, /в ЛС \/reg/);
});

test('/del with no number asks which one', async () => {
  const store = tempStore();
  const { sent, send } = collector();
  const bot = createBot({ store, send });
  await bot.handleUpdate(reg(5, '/reg Аттар\nСила 8'));
  await bot.handleUpdate(reg(5, '/del'));
  assert.match(sent[sent.length - 1].text, /Кого удалить/);
  assert.equal(charactersOf(await store.get(5)).length, 1);
});

test('/del in a group is refused', async () => {
  const store = tempStore();
  const { sent, send } = collector();
  const bot = createBot({ store, send });
  await bot.handleUpdate(reg(5, '/reg Аттар\nСила 8'));
  await bot.handleUpdate(groupMsg(5, 100, '/del 1'));
  assert.match(sent[sent.length - 1].text, /только в личке/);
  assert.equal(charactersOf(await store.get(5)).length, 1);
});

test('/my lists every character with its handle', async () => {
  const store = tempStore();
  const { sent, send } = collector();
  const bot = createBot({ store, send });
  await bot.handleUpdate(reg(5, '/reg Аттар @attar\nСила 8'));
  await bot.handleUpdate(reg(5, '/reg Бо @bob\nСила 4'));
  await bot.handleUpdate({ message: { message_id: 9, chat: { id: 5, type: 'private' }, from: { id: 5 }, text: '/my' } });
  const text = sent[sent.length - 1].text;
  assert.match(text, /Твои персонажи/);
  assert.match(text, /1\. Аттар \(@attar\)/);
  assert.match(text, /2\. Бо \(@bob\)/);
});

test('/post prints the battle-post rules and who rolls', async () => {
  const store = tempStore();
  const { sent, send } = collector();
  const bot = createBot({ store, send });
  await bot.handleUpdate({ message: { message_id: 1, chat: { id: 5, type: 'private' }, from: { id: 5 }, text: '/post' } });
  const text = sent[0].text;
  assert.match(text, /Правила написания поста в бою/);
  assert.match(text, /Кубик кидает только игрок/);
  assert.match(text, /\/roll1/);
  assert.match(text, /\/roll2/);
  assert.match(text, /\/rollall/);
  // A roll is for an action; a quiet post needs none.
  assert.match(text, /бросок не нужен/);
  assert.doesNotMatch(text, /укрытии \/roll/);
});

test('/rules says only the player rolls', async () => {
  const store = tempStore();
  const { sent, send } = collector();
  const bot = createBot({ store, send });
  await bot.handleUpdate({ message: { message_id: 1, chat: { id: 5, type: 'private' }, from: { id: 5 }, text: '/rules' } });
  assert.match(sent[0].text, /Кубик кидает только игрок/);
  assert.match(sent[0].text, /пост в бою/);
});
