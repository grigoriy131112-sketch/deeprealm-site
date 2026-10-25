import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  telegramConfig, splitMessage, createNotifier
} from '../telegram.js';
import { keepsEssentials, createLiveSpeaker } from '../ai-maker.js';
import {
  sentToOwnerText, applicationTitle, staffAnswerPairs, setKnowledge, findRole,
  STAFF_MAX_QUESTIONS, setSheetDetector
} from '../chat-core.js';
import { setNotifier, answerInterview, answerStaff, setLiveCaller, answerGuide } from '../chat-answers.js';
import { localInterview, parseFieldEdit, finishSheet, generatedSheet } from '../ai-engine.js';
import { generateClass } from '../ai-gen.js';
import { detectSheetKind } from '../publish.js';

// These tests run against the real knowledge base, so the reply texts and the
// scripted questions are the ones the site actually uses.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
setKnowledge(JSON.parse(fs.readFileSync(path.join(root, 'data', 'knowledge.json'), 'utf8')));
// The same detector the server injects, so an approved plot is recognised here too.
setSheetDetector(detectSheetKind);

// A filled-in sheet followed by "проверь", which is how the built-in Interviewer
// reaches its verdict when no model is present.
const SHEET = 'Имя: Лира. Раса: Эльф. Класс: Маг. Характер: спокойная, есть слабость к огню.';
const APPROVED_DIALOGUE = [
  { role: 'user', content: SHEET },
  { role: 'assistant', content: 'Расскажи про «Внешность».' },
  { role: 'user', content: 'проверь' }
];

// A fetch stand-in that records the calls and answers with a canned reply. It is
// the only way to observe what would go over the wire without messaging Telegram
// for real; the code under test is untouched.
function fakeFetch(reply, { ok = true, status = 200 } = {}) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return {
      ok,
      status,
      json: async () => reply,
      text: async () => JSON.stringify(reply)
    };
  };
  fn.calls = calls;
  return fn;
}

test('telegram config prefers the environment and reads the file as a fallback', () => {
  const fromEnv = telegramConfig({ TELEGRAM_BOT_TOKEN: 'env-token', TELEGRAM_CHAT_ID: '42' }, { token: 'file-token', chatId: '7' });
  assert.equal(fromEnv.token, 'env-token');
  assert.equal(fromEnv.chatId, '42');
  const fromFile = telegramConfig({}, { token: 'file-token', chatId: '7', visitGapMinutes: 30 });
  assert.equal(fromFile.token, 'file-token');
  assert.equal(fromFile.visitGapMs, 30 * 60000);
});

test('every configured recipient gets the notification', async () => {
  const fetchImpl = fakeFetch({ ok: true });
  const notifier = createNotifier({
    config: telegramConfig({ TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '111', TELEGRAM_CHAT_IDS: '222, 333' }, {}),
    fetchImpl
  });
  const result = await notifier.sheet({ kind: 'story', title: 'Банк призраков', text: 'текст' });
  assert.equal(result.ok, true);
  assert.equal(result.recipients, 3);
  const ids = fetchImpl.calls.map((c) => c.body.chat_id);
  assert.deepEqual(ids, ['222', '333', '111'], 'the extra ids plus the primary one');
});

test('a repeated recipient id is not sent to twice', async () => {
  const fetchImpl = fakeFetch({ ok: true });
  const notifier = createNotifier({
    config: telegramConfig({ TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '42', TELEGRAM_CHAT_IDS: '42,42' }, {}),
    fetchImpl
  });
  const result = await notifier.visit({ session: 's', page: 'home' });
  assert.equal(result.ok, true);
  assert.equal(fetchImpl.calls.length, 1);
});

test('splitMessage keeps short text whole and splits long text on a line break', () => {
  assert.deepEqual(splitMessage('  коротко  '), ['коротко']);
  assert.deepEqual(splitMessage(''), []);
  const lines = Array.from({ length: 6 }, (_, i) => `строка ${i} ${'x'.repeat(20)}`).join('\n');
  const parts = splitMessage(lines, 80);
  assert.ok(parts.length > 1, 'long text is split');
  for (const part of parts) assert.ok(part.length <= 80, 'no part exceeds the limit');
  assert.equal(parts.join('\n').replace(/\s+/g, ' '), lines.replace(/\s+/g, ' '), 'no content is lost');
});

test('an unconfigured notifier is a no-op that reports skipped', async () => {
  const notifier = createNotifier({ config: telegramConfig({}, {}), fetchImpl: fakeFetch({}) });
  assert.equal(notifier.enabled, false);
  const result = await notifier.visit({ session: 'a' });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'not_configured');
});

test('a visit is sent once per session and throttled afterwards', async () => {
  const fetchImpl = fakeFetch({ ok: true });
  const notifier = createNotifier({
    config: { token: 't', chatId: 'c', visitGapMs: 60000 },
    fetchImpl
  });
  const first = await notifier.visit({ session: 's1', page: 'home' });
  assert.equal(first.ok, true);
  assert.equal(fetchImpl.calls.length, 1);
  assert.match(fetchImpl.calls[0].url, /\/bott\/sendMessage/, 'the bot send endpoint is used');
  assert.equal(fetchImpl.calls[0].body.chat_id, 'c');
  assert.match(fetchImpl.calls[0].body.text, /Новый заход/);
  const again = await notifier.visit({ session: 's1' });
  assert.equal(again.skipped, true);
  assert.equal(again.reason, 'throttled');
  assert.equal(fetchImpl.calls.length, 1, 'a repeated visit sends nothing');
  const other = await notifier.visit({ session: 's2' });
  assert.equal(other.ok, true, 'a different session is a new visit');
});

test('a sheet notification carries the title and the full text', async () => {
  const fetchImpl = fakeFetch({ ok: true });
  const notifier = createNotifier({ config: { token: 't', chatId: 'c' }, fetchImpl });
  const result = await notifier.sheet({ kind: 'race', title: 'Стеклянные', text: 'Название: Стеклянные' });
  assert.equal(result.ok, true);
  const text = fetchImpl.calls[0].body.text;
  assert.match(text, /Новая анкета расы/);
  assert.match(text, /Стеклянные/);
});

test('a staff notification lists every question with its answer', async () => {
  const fetchImpl = fakeFetch({ ok: true });
  const notifier = createNotifier({ config: { token: 't', chatId: 'c' }, fetchImpl });
  await notifier.staff({
    role: 'Модератор',
    answers: [{ q: 'Сколько времени уделишь?', a: 'Пару часов в день' }],
    verdict: 'РЕКОМЕНДОВАН'
  });
  const text = fetchImpl.calls[0].body.text;
  assert.match(text, /Собеседование в администрацию/);
  assert.match(text, /Сколько времени уделишь\?/);
  assert.match(text, /Пару часов в день/);
  assert.match(text, /РЕКОМЕНДОВАН/);
});

test('a long sheet is split into several messages', async () => {
  const fetchImpl = fakeFetch({ ok: true });
  const notifier = createNotifier({ config: { token: 't', chatId: 'c' }, fetchImpl });
  await notifier.sheet({ kind: 'character', text: 'я'.repeat(9000) });
  assert.ok(fetchImpl.calls.length >= 3, 'the sheet arrives in parts');
  for (const call of fetchImpl.calls) assert.ok(call.body.text.length <= 3800);
});

test('a failing Telegram call is reported, not thrown', async () => {
  const fetchImpl = fakeFetch({ description: 'bad token' }, { ok: false, status: 401 });
  const notifier = createNotifier({ config: { token: 't', chatId: 'c' }, fetchImpl });
  const result = await notifier.sheet({ text: 'x' });
  assert.equal(result.ok, false);
  assert.match(result.error, /401/);
});

test('keepsEssentials protects links, the ending word and the approval mark', () => {
  const local = 'ОДОБРЕНО ✅\n\nАнкета отправлена владельцу.\nЧат: https://t.me/Deeprealm5\n\nконец';
  assert.equal(keepsEssentials('ОДОБРЕНО ✅ Всё отлично! Чат: https://t.me/Deeprealm5\nконец', local), true, 'a faithful rewrite passes');
  assert.equal(keepsEssentials('Все хорошо', local), false, 'a dropped link is rejected');
  assert.equal(keepsEssentials('ОДОБРЕНО ✅ https://t.me/Deeprealm5', local), false, 'a dropped ending word is rejected');
  assert.equal(keepsEssentials('Ссылка https://t.me/Deeprealm5 конец', local), false, 'a dropped approval is rejected');
  assert.equal(keepsEssentials('**ОДОБРЕНО ✅** https://t.me/Deeprealm5 конец', local), false, 'markdown is rejected');
  assert.equal(keepsEssentials('', local), false, 'an empty rewrite is rejected');
});

test('the live speaker rests after a failure instead of retrying every message', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return { ok: false, status: 500, text: async () => 'boom' }; };
  const speak = createLiveSpeaker({ fetchImpl, timeoutMs: 50, cooldownMs: 60000 });
  await assert.rejects(() => speak([{ role: 'user', content: 'привет' }]));
  await assert.rejects(() => speak([{ role: 'user', content: 'привет' }]), /resting/);
  assert.equal(calls, 1, 'the second call is skipped while resting');
});

test('the live speaker returns the model text on success', async () => {
  const fetchImpl = fakeFetch({ choices: [{ message: { content: 'Живой ответ' } }] });
  const speak = createLiveSpeaker({ fetchImpl, timeoutMs: 50 });
  assert.equal(await speak([{ role: 'user', content: 'привет' }]), 'Живой ответ');
});

// The free endpoint needs ten to twenty-five seconds, so the caller is allowed to
// wait longer than the default without changing the default itself.
test('the live speaker accepts a per-call timeout', async () => {
  let seen = 0;
  const slow = async (url, init) => {
    seen += 1;
    const signal = init && init.signal;
    if (signal && signal.aborted) throw new Error('aborted too early');
    await new Promise((resolve, reject) => {
      const t = setTimeout(resolve, 30);
      if (signal) signal.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')); });
    });
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'Живой ответ' } }] }) };
  };
  const speak = createLiveSpeaker({ fetchImpl: slow, timeoutMs: 5, cooldownMs: 60000 });
  assert.equal(await speak([{ role: 'user', content: 'привет' }], { timeoutMs: 200 }), 'Живой ответ');
  assert.equal(seen, 1);
});

// The chat must not sit on "thinking" for twenty seconds and then throw the rewrite
// away. With an onLive hook the engine's answer is returned at once and the livelier
// wording is handed back separately.
test('the guide answers at once and hands the live rewrite to the caller', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  setLiveCaller(async () => { await gate; return 'Живой ответ конец'; });
  try {
    let pending = null;
    const out = await answerGuide({
      messages: [{ role: 'user', content: 'Какие есть расы?' }],
      onLive: (p) => { pending = p; }
    });
    assert.ok(out.reply && out.reply.length > 0, 'the engine answers without waiting');
    assert.equal(out.livePending, true, 'the caller is told a rewrite is on the way');
    assert.ok(pending, 'the rewrite is handed to the caller');
    release();
    assert.match(await pending, /Живой ответ/, 'the rewrite is delivered later');
  } finally {
    setLiveCaller(null);
  }
});

test('owner-delivery text tells the truth when sending fails', () => {
  const ok = sentToOwnerText('interview', 'ru', { delivered: true });
  assert.match(ok, /передан[а]? владельцу/);
  const failed = sentToOwnerText('interview', 'ru', { delivered: false });
  assert.match(failed, /не удалось/);
  assert.match(failed, /@Omega_Gribcha/, 'the owner contact is repeated so a sheet is not lost');
  const staffOk = sentToOwnerText('staff', 'ru', { delivered: true });
  assert.match(staffOk, /Все ответы переданы владельцу/);
});

test('applicationTitle prefers a real name over the kind label', () => {
  assert.equal(applicationTitle({ 'Имя': 'Лира' }, 'character'), 'Лира');
  assert.equal(applicationTitle({ 'Название': 'Стеклянные' }, 'race'), 'Стеклянные');
  assert.equal(applicationTitle({}, 'race'), 'Раса');
  assert.equal(applicationTitle({}, ''), 'Анкета');
});

test('staffAnswerPairs pairs each question with the answer that followed it', () => {
  const role = findRole('moderator');
  const questions = role.questions;
  const history = [
    { role: 'user', content: 'хочу быть модератором' },
    { role: 'assistant', content: questions[0] },
    { role: 'user', content: 'Ответ один' },
    { role: 'assistant', content: questions[1] },
    { role: 'user', content: 'Ответ два' }
  ];
  const pairs = staffAnswerPairs(history, { branch: 'moderator' });
  assert.equal(pairs.length, 2, 'only the answered questions are paired');
  assert.deepEqual(pairs[0], { q: questions[0], a: 'Ответ один' });
  assert.deepEqual(pairs[1], { q: questions[1], a: 'Ответ два' });
});

test('an approved interview forwards the sheet to the owner through the notifier', async () => {
  const sent = [];
  setNotifier(async (info) => { sent.push(info); return { ok: true }; });
  const out = await answerInterview({ messages: APPROVED_DIALOGUE, lang: 'ru' });
  assert.equal(out.finale, true);
  assert.equal(out.delivered, true);
  assert.equal(sent.length, 1, 'the owner gets exactly one message');
  assert.match(sent[0].text, /Лира/);
  assert.match(out.reply, /передан[а]? владельцу/);
  setNotifier(null);
});

test('a failed notification says so instead of claiming delivery', async () => {
  setNotifier(async () => ({ ok: false, error: 'telegram 401' }));
  const out = await answerInterview({ messages: APPROVED_DIALOGUE, lang: 'ru' });
  assert.equal(out.delivered, false);
  assert.match(out.reply, /не удалось/);
  assert.match(out.reply, /@Omega_Gribcha/);
  setNotifier(null);
});

test('a notification that never settles cannot freeze the approval', async () => {
  // The relay and the Telegram endpoint can accept a request and never answer. The
  // player must still get the verdict and the hand-off, with delivery reported as
  // failed, instead of the chat staying on "the Interviewer is thinking" forever.
  setNotifier(() => new Promise(() => {}));
  const out = await answerInterview({ messages: APPROVED_DIALOGUE, lang: 'ru', notifyTimeoutMs: 50 });
  assert.equal(out.finale, true, 'the intake still reaches the player');
  assert.equal(out.delivered, false);
  assert.match(out.reply, /Отправить владельцу автоматически не удалось/);
  assert.match(out.reply, /Анкета уже у владельца/);
  setNotifier(null);
});

test('a finished staff interview sends all the answers to the owner', async () => {
  const sent = [];
  setNotifier(async (info) => { sent.push(info); return { ok: true }; });
  const role = findRole('moderator');
  const asked = role.questions.slice(0, STAFF_MAX_QUESTIONS);
  const messages = [{ role: 'user', content: 'хочу быть модератором' }];
  for (const q of asked) {
    messages.push({ role: 'assistant', content: q });
    messages.push({ role: 'user', content: 'готов, отвечаю по делу' });
  }
  const out = await answerStaff({ messages, lang: 'ru' });
  assert.equal(out.done, true);
  assert.equal(sent.length, 1, 'one message carries the whole interview');
  assert.equal(sent[0].answers.length, asked.length, 'every asked question is paired');
  assert.match(out.reply, /Все ответы переданы владельцу/);
  setNotifier(null);
});

test('a staff interview ends after the fixed number of questions', async () => {
  // The candidate answers, but also asks a question of their own every time - the
  // shape that used to make the interviewer loop forever.
  const messages = [{ role: 'user', content: 'привет. Я хочу быть модератором, сколько вопросов ты задашь?' }];
  for (let i = 0; i < 10; i++) {
    const out = await answerStaff({ messages, lang: 'ru' });
    if (out.done) return assert.ok(i < 10, `the interview ended after ${i} turns`);
    messages.push({ role: 'assistant', content: out.reply });
    messages.push({ role: 'user', content: 'Да, готов. А что если я пропаду?' });
  }
  assert.fail('the staff interview never ended');
});

test('a character interview stops asking once the essentials are covered', () => {
  const answer = 'Меня зовут Лира, я эльфийка-маг, спокойная, волосы светлые.';
  const history = [{ role: 'user', content: answer }];
  const seen = new Set();
  for (let i = 0; i < 12; i++) {
    const reply = localInterview({ messages: history, lang: 'ru', application: {} });
    // The closing nudge says "say проверь", which is not a field question.
    const asked = (reply.match(/«([^»]+)»/) || [])[1];
    if (asked && asked !== 'проверь') {
      assert.ok(!seen.has(asked), `«${asked}» was asked twice`);
      seen.add(asked);
    }
    history.push({ role: 'assistant', content: reply });
    history.push({ role: 'user', content: answer });
  }
  assert.ok(seen.size <= 6, 'the walk stays short');
  assert.ok(/проверь/i.test(history[history.length - 2].content), 'the check is offered');
});

test('a plot is recognised and walked through its own checklist', () => {
  const history = [{ role: 'user', content: 'Хочу предложить сюжет для ГМ' }];
  const first = localInterview({ messages: history, lang: 'ru', application: {} });
  assert.match(first, /Название сюжета/, 'the plot checklist is used, not the character one');
  history.push({ role: 'assistant', content: first });
  history.push({ role: 'user', content: 'Название сюжета: Банк призраков. Жанр: мрачное фэнтези. Завязка: бармен падает замертво.' });
  const second = localInterview({ messages: history, lang: 'ru', application: {} });
  assert.match(second, /Главная проблема/, 'the walk continues with the next plot field');
});

test('an approved plot goes to the owner and is not published by the site', async () => {
  const sent = [];
  setNotifier(async (info) => { sent.push(info); return { ok: true }; });
  const messages = [
    { role: 'user', content: 'Хочу предложить сюжет для ГМ' },
    { role: 'assistant', content: 'Расскажи про «Название сюжета».' },
    { role: 'user', content: 'Название сюжета: Банк призраков. Жанр: мрачное фэнтези. Завязка: бармен падает замертво. Главная проблема: город наводнён призраками. Антагонист: Леди Вереск. Локации: портовый город.' },
    { role: 'assistant', content: 'Расскажи про «Локации».' },
    { role: 'user', content: 'проверь' }
  ];
  const out = await answerInterview({ messages, lang: 'ru' });
  assert.equal(sent.length, 1, 'the owner gets the plot');
  assert.equal(sent[0].kind, 'story');
  assert.equal(sent[0].title, 'Банк призраков', 'the plot title reaches the owner');
  assert.match(out.reply, /Сюжет передан владельцу/);
  // The site no longer publishes a race, a class or a plot itself: the owner
  // posts them in the blog, and the pages read the blog.
  assert.equal(out.published, undefined, 'nothing is published by the site');
  setNotifier(null);
});

test('asking for a race starts the race checklist, not the character one', () => {
  // The exact chip the Interviewer page offers. Before the fix this fell through
  // to the character walk, so a race could never be created.
  for (const ask of ['Хочу создать расу', 'Я хочу создать расу', 'создать расу', 'I want to create a race']) {
    const reply = localInterview({ messages: [{ role: 'user', content: ask }], lang: 'ru', application: {} });
    assert.match(reply, /анкету расы/, `"${ask}" opens the race walk`);
    assert.match(reply, /«Название»/, `"${ask}" asks the first race field`);
    assert.doesNotMatch(reply, /«Имя»/, `"${ask}" must not ask a character field`);
  }
});

test('asking for a class starts the class checklist and mentions the cooldown rule', () => {
  const reply = localInterview({ messages: [{ role: 'user', content: 'Хочу создать класс' }], lang: 'ru', application: {} });
  assert.match(reply, /анкету класса/, 'the class walk opens');
  assert.match(reply, /«Название класса»/, 'the first class field is asked');
  assert.match(reply, /перезарядка/i, 'the cooldown-in-turns rule is stated');
  assert.doesNotMatch(reply, /«Имя»/, 'no character field is asked');
});

test('a race interview continues on its own checklist and approves a full sheet', () => {
  // The draft remembers the checklist, so the walk does not fall back to the
  // character template once the opening request is no longer the newest message.
  const app = { _kind: 'race' };
  const history = [{ role: 'user', content: 'Название: Тени' }];
  const reply = localInterview({ messages: history, lang: 'ru', application: app });
  assert.match(reply, /«Самоназвание»/, 'the race walk moves to its next field');
  assert.doesNotMatch(reply, /«Имя»/, 'the character template is not used');

  const full = {
    _kind: 'race', 'Название': 'Тени', 'Самоназвание': 'Шадэ', 'Внешность': 'высокие, серые глаза',
    'Где живут': 'подземелья', 'Способности': 'шаг сквозь тень', 'Уязвимости': 'свет и соль'
  };
  const approved = localInterview({ messages: [{ role: 'user', content: 'проверь' }], lang: 'ru', application: full });
  assert.match(approved, /передаю её владельцу/, 'a filled race sheet is accepted and handed off');
});

test('a thin race sheet is not approved and is not filed as a character', async () => {
  const thin = localInterview({ messages: [{ role: 'user', content: 'проверь' }], lang: 'ru', application: { _kind: 'race', 'Название': 'Тени' } });
  assert.doesNotMatch(thin, /передан[а]? владельцу/, 'one field is not enough for a race');
  assert.match(thin, /не заполнена/);

  const sent = [];
  setNotifier(async (info) => { sent.push(info); return { ok: true }; });
  const messages = [
    { role: 'user', content: 'Хочу создать расу' },
    { role: 'assistant', content: 'Расскажи про «Название».' },
    { role: 'user', content: 'Название: Тени. Самоназвание: Шадэ. Внешность: высокие. Где живут: подземелья. Способности: шаг сквозь тень. Уязвимости: свет.' },
    { role: 'assistant', content: 'Если основное рассказал — скажи «проверь».' },
    { role: 'user', content: 'проверь' }
  ];
  const out = await answerInterview({ messages, lang: 'ru' });
  assert.equal(sent.length, 1, 'the race goes to the owner');
  assert.equal(sent[0].kind, 'race', 'the draft kind keeps it out of the character bucket');
  assert.equal(out.application._kind, 'race', 'the kind is remembered in the draft');
  setNotifier(null);
});

// The Interviewer must be able to author a race or a class itself, not only ask the
// player to describe one. These are the phrasings the owner tried by hand.
test('the interviewer authors a race itself when asked to', () => {
  for (const ask of ['можешь создать расу для меня сам', 'создай мне расу', 'придумай за меня расу', 'придумай мне расу сам']) {
    const reply = localInterview({ messages: [{ role: 'user', content: ask }], lang: 'ru', application: {} });
    assert.match(reply, /Готово/, `"${ask}" makes the interviewer build a race`);
    assert.match(reply, /Название:/, `"${ask}" returns a named race`);
    assert.match(reply, /Уязвимости:/, `"${ask}" gives the race its weaknesses`);
    assert.doesNotMatch(reply, /Расскажи про «/, `"${ask}" must not fall back to asking the player`);
  }
});

test('the interviewer authors a class itself, with cooldowns where they belong', () => {
  const reply = localInterview({ messages: [{ role: 'user', content: 'создай мне класс сам' }], lang: 'ru', application: {} });
  assert.match(reply, /Готово/, 'the class is built on request');
  assert.match(reply, /Название класса:/, 'the class is named');
  assert.match(reply, /Перезарядка:/, 'cooldowns are given in turns');
  assert.match(reply, /Истощение ресурса:/, 'the resource exhaustion rule is stated');
  assert.doesNotMatch(reply, /Расскажи про «/, 'the player is not sent back to the checklist');
  // Both ultimates carry a cooldown, but not every base ability does: the owner asked
  // for "перезарядка должна быть не везде".
  const cooldowns = (reply.match(/Перезарядка:/g) || []).length;
  const abilities = (reply.match(/Ур\. \d+:/g) || []).length;
  assert.ok(cooldowns > 0 && cooldowns < abilities, `some but not all abilities have a cooldown (${cooldowns}/${abilities})`);
});

test('every level 1-15 offers at least two abilities', () => {
  // The owner's requirement: "До 15 уровня должно быть не меньше 2 способностей".
  // The generated class used to carry only twelve abilities for fifteen levels.
  for (const seed of [0, 1, 2, 3, 4, 5]) {
    const draft = generateClass('ru', seed);
    const perLevel = {};
    for (const line of draft.text.split('\n')) {
      const m = line.match(/Ур\. (\d+):/);
      if (m) perLevel[m[1]] = (perLevel[m[1]] || 0) + 1;
    }
    for (let level = 1; level <= 15; level++) {
      assert.ok((perLevel[level] || 0) >= 2, `${draft.name}: level ${level} offers ${perLevel[level] || 0} abilities, need 2`);
    }
  }
});

test('base cooldowns stay at 2-3 turns and are not on every ability', () => {
  // The owner: "на уровнях до 15 должно быть максимум 2-3 хода перезарядка.
  // На других уже может быть больше. И перезарядка должна быть не везде".
  for (const seed of [0, 1, 2, 3, 4, 5]) {
    const draft = generateClass('ru', seed);
    const base = draft.app['Способности'];
    const baseLines = base.split('\n').filter((l) => /Ур\. \d+:/.test(l));
    const baseCds = [...base.matchAll(/Перезарядка: (\d+) ход/g)].map((m) => Number(m[1]));
    assert.ok(baseCds.length, `${draft.name}: base abilities carry cooldowns`);
    assert.ok(Math.max(...baseCds) <= 3, `${draft.name}: base cooldown max is ${Math.max(...baseCds)}, want <= 3`);
    const withCd = baseLines.filter((l) => /Перезарядка:/.test(l)).length;
    assert.ok(withCd < baseLines.length, `${draft.name}: not every base ability has a cooldown (${withCd}/${baseLines.length})`);
    const specCds = [...draft.text.matchAll(/Ур\. (?:1[6-9]|[2-4]\d):[^\n]*Перезарядка: (\d+) ход/g)].map((m) => Number(m[1]));
    if (specCds.length) assert.ok(Math.max(...specCds) <= 5, `${draft.name}: spec cooldown max is ${Math.max(...specCds)}, want <= 5`);
  }
});

test('a stated requirement is acknowledged instead of brushed off', () => {
  const app = { _kind: 'class', 'Название класса': 'Громовой заклинатель' };
  const reply = localInterview({ messages: [{ role: 'user', content: 'До 15 уровня должно быть не меньше 2 способностей' }], lang: 'ru', application: app });
  assert.match(reply, /Понял: на каждом уровне — не меньше двух способностей/, 'the ability rule is confirmed');
  assert.doesNotMatch(reply, /Отлично, вот это уже деталь/, 'not brushed off as small talk');
  const cd = localInterview({ messages: [{ role: 'user', content: 'перезарядки не должны быть большими' }], lang: 'ru', application: app });
  assert.match(cd, /Понял: перезарядки короткие/, 'the cooldown wish is confirmed');
});

test('the exact cooldown request is acknowledged, not dumped as generic advice', () => {
  // The owner's message: "Уменьши перезорядку, на уровнях до 15 должно быть максимум
  // 2-3 хода перезарядка. На других уже может быть больше. И перезарядка должна быть
  // не везде". The "может быть" inside it used to route the whole message to the
  // generic advice dump.
  const app = { _kind: 'class', 'Название класса': 'Громовой заклинатель' };
  const text = 'Уменьши перезорядку, на уровнях до 15 должно быть максимум 2-3 хода перезарядка. На других уже может быть больше. И перезарядка должна быть не везде';
  const reply = localInterview({ messages: [{ role: 'user', content: text }], lang: 'ru', application: app });
  assert.match(reply, /Понял: перезарядка не на каждой способности/, 'the three cooldown rules are confirmed');
  assert.doesNotMatch(reply, /Разберём баланс класса/, 'not the generic advice dump');
  assert.doesNotMatch(reply, /Отлично, вот это уже деталь/, 'not brushed off');
});

test('"я сам" still opens the walk: the player writes it, not the interviewer', () => {
  const reply = localInterview({ messages: [{ role: 'user', content: 'Я сам создам расу' }], lang: 'ru', application: {} });
  assert.match(reply, /Правила/, 'the race walk opens instead of generating');
  assert.doesNotMatch(reply, /Готово/, 'the interviewer does not author it against the player\'s wish');
});

test('a self-made race is stored, approved and sent to the owner', async () => {
  const sent = [];
  setNotifier(async (info) => { sent.push(info); return { ok: true }; });
  const messages = [{ role: 'user', content: 'можешь создать расу для меня сам' }];
  const first = await answerInterview({ messages, lang: 'ru' });
  assert.match(first.reply, /Готово/, 'the race is authored');
  assert.equal(first.application._kind, 'race', 'the draft is a race');
  assert.ok(first.application['Название'], 'the generated fields are stored in the draft');
  assert.ok(first.application['Уязвимости'], 'the weaknesses are stored too');

  // The very next "проверь" approves the generated sheet without more questions.
  messages.push({ role: 'assistant', content: first.reply }, { role: 'user', content: 'проверь' });
  const second = await answerInterview({ messages, lang: 'ru', application: first.application });
  assert.match(second.reply, /передан[а]? владельцу/, 'the generated race is accepted and handed off');
  assert.equal(sent.length, 1, 'the generated race is sent to the owner');
  assert.equal(sent[0].kind, 'race');
  assert.equal(sent[0].title, first.application['Название'], 'the owner gets the generated name');
  setNotifier(null);
});

test('a self-made class is stored, approved and sent to the owner', async () => {
  const sent = [];
  setNotifier(async (info) => { sent.push(info); return { ok: true }; });
  const messages = [{ role: 'user', content: 'придумай мне класс сам' }];
  const first = await answerInterview({ messages, lang: 'ru' });
  assert.match(first.reply, /Готово/, 'the class is authored');
  assert.equal(first.application._kind, 'class', 'the draft is a class');

  messages.push({ role: 'assistant', content: first.reply }, { role: 'user', content: 'проверь' });
  const second = await answerInterview({ messages, lang: 'ru', application: first.application });
  assert.match(second.reply, /передан[а]? владельцу/, 'the generated class is accepted and handed off');
  assert.equal(sent.length, 1, 'the generated class is sent to the owner');
  assert.equal(sent[0].kind, 'class');
  setNotifier(null);
});

test('a class is built from the race and idea the player named', () => {
  // The owner: asked for a class for a half-human, half-undead race, the Registrar
  // returned a storm mage. The idea must pick the matching kit.
  const undead = localInterview({ messages: [{ role: 'user', content: 'создай класс по расе полу люди, полу нежить' }], lang: 'ru', application: {} });
  assert.match(undead, /^Готово/m, 'the class is authored from the idea');
  assert.match(undead, /Ресурс: Кости/, 'the undead idea picks the undead class, not a storm mage');
  assert.match(undead, /Идея игрока: .*нежить/, 'the player\'s idea is quoted back');

  const ice = localInterview({ messages: [{ role: 'user', content: 'создай ледяной класс' }], lang: 'ru', application: {} });
  assert.match(ice, /Ресурс: Мороз/, 'an ice idea picks the ice class');
});

test('a race is built for the class the player named', () => {
  // The mirror the owner asked for: a race made to fit a class.
  const storm = localInterview({ messages: [{ role: 'user', content: 'сделай расу под громового заклинателя' }], lang: 'ru', application: {} });
  assert.match(storm, /^Готово/m, 'the race is authored for the class');
  assert.match(storm, /Магия: владеют — Молния и Ветер/, 'a storm class draws a storm-blooded race');

  const undead = localInterview({ messages: [{ role: 'user', content: 'сделай расу под класс «Костепевец»' }], lang: 'ru', application: {} });
  assert.match(undead, /Магия: владеют — Некромантия и Тьма/, 'a bone class draws an undead race');
});

test('a race built for a class is stored with the class it was made for', () => {
  const made = generatedSheet([{ role: 'user', content: 'сделай расу под громового заклинателя' }], {}, 'ru');
  assert.equal(made.kind, 'race', 'a race is produced');
  assert.equal(made.app['Под класс'], 'громового заклинателя', 'the race is tied to the named class');
  assert.ok(made.app['Совместимость с классом'], 'the compatibility line is stored');
});

test('a race requested for an unnamed class asks which class', () => {
  for (const q of ['сделай расу под мой класс', 'сделай расу под класс игрока', 'нужна раса под класс']) {
    const reply = localInterview({ messages: [{ role: 'user', content: q }], lang: 'ru', application: {} });
    assert.match(reply, /назови класс/, `asks for the class: ${q}`);
    assert.doesNotMatch(reply, /^Готово/m, `does not invent a race: ${q}`);
  }
});

test('the class idea is remembered when the player then says "создай"', () => {
  const first = localInterview({ messages: [{ role: 'user', content: 'хочу класс' }], lang: 'ru', application: {} });
  assert.doesNotMatch(first, /^Готово/m, 'a plain request opens the walk');
  const second = localInterview({
    messages: [
      { role: 'user', content: 'хочу класс' },
      { role: 'assistant', content: first },
      { role: 'user', content: 'идея: полу нежить' }
    ], lang: 'ru', application: {}
  });
  assert.match(second, /^Готово/m, 'the remembered idea is used on the next turn');
  assert.match(second, /Ресурс: Кости/, 'and it picks the undead kit');
});

test('a class built for an existing race names that race and its milestones', async () => {
  const sent = [];
  setNotifier(async (info) => { sent.push(info); return { ok: true }; });
  const messages = [{ role: 'user', content: 'сделай класс под готовую расу Пепельники' }];
  const first = await answerInterview({ messages, lang: 'ru' });
  assert.equal(first.application['Под расу'], 'Пепельники', 'the class is tied to the named race');
  assert.match(first.reply, /Специализации \(выбор на 16 уровне\)/, 'the milestones are explained');
  // One ability per intermediate level, three specializations.
  for (const level of [16, 19, 21, 29, 31, 39, 41, 49]) {
    const hits = first.reply.split(`Ур. ${level}:`).length - 1;
    assert.equal(hits, 3, `level ${level} grants one ability in each of the three specializations`);
  }
  assert.equal(first.reply.split('Специализация «').length - 1, 3, 'three specializations');

  messages.push({ role: 'assistant', content: first.reply }, { role: 'user', content: 'проверь' });
  const second = await answerInterview({ messages, lang: 'ru', application: first.application });
  assert.match(second.reply, /передан[а]? владельцу/, 'the race-based class is accepted and handed off');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].kind, 'class');
  setNotifier(null);
});

test('a class is built for a race the player pasted a turn earlier', async () => {
  // The owner: a player pastes a ready race, then asks for a class for it, and the
  // Registrar does not build one. The pasted sheet is one turn back, so its race must
  // be read from the dialogue, not only the newest message.
  const sent = [];
  setNotifier(async (info) => { sent.push(info); return { ok: true }; });
  const pasted = 'Название: Пепельники\nСамоназвание: Тлеющие\nВнешность: пепельная кожа\nГде живут: пустоши\nЧем занимаются: собирают пепел\nБоевые навыки: швыряют обломки\nСпособности: Жар ядра\nУязвимости: вода\nМагия: Огонь';
  const history = [{ role: 'user', content: pasted }, { role: 'assistant', content: 'Принял' }];
  for (const ask of ['сделай для этой расы класс', 'создай класс для этой расы', 'сделай класс для неё']) {
    const made = generatedSheet([...history, { role: 'user', content: ask }], { _kind: 'race' }, 'ru');
    assert.ok(made, `a class is built: ${ask}`);
    assert.equal(made.kind, 'class', `the sheet is a class: ${ask}`);
    assert.equal(made.app['Под расу'], 'Пепельники', `the pasted race is the subject: ${ask}`);
  }
  // The reply names the race, so the player can see it was read.
  const reply = localInterview({ messages: [...history, { role: 'user', content: 'сделай для этой расы класс' }], lang: 'ru', application: {} });
  assert.match(reply, /^Готово/m, 'the class is authored');
  assert.match(reply, /Пепельники/, 'the pasted race is named in the reply');
  assert.doesNotMatch(reply, /назови расу/, 'no second question about the race');
  // And the finished class is handed off as a class, not filed as the pasted race.
  const messages = [...history, { role: 'user', content: 'сделай для этой расы класс' }];
  const first = await answerInterview({ messages, lang: 'ru' });
  assert.equal(first.application._kind, 'class', 'the draft is a class');
  messages.push({ role: 'assistant', content: first.reply }, { role: 'user', content: 'проверь' });
  const second = await answerInterview({ messages, lang: 'ru', application: first.application });
  assert.match(second.reply, /передан[а]? владельцу/, 'the class is handed off');
  assert.equal(sent[0].kind, 'class', 'the owner gets it as a class');
  setNotifier(null);
});

test('a class is built for a race named from the blog without the word "раса"', () => {
  // The owner: a player names their own race ("разумные растения") from the blog and
  // asks for a class, and the Registrar does not build one. The name must be read
  // from the corpus, not only from the literal "раса" word.
  for (const [ask, race] of [
    ['сделай класс для расы разумные растения', 'разумные растения'],
    ['хочу класс для расы разумные цветы', 'Разумные цветы'],
    ['создай класс для синтетиков', 'Синтетики'],
    ['сделай класс для эльфа', 'Эльф']
  ]) {
    const reply = localInterview({ messages: [{ role: 'user', content: ask }], lang: 'ru', application: {} });
    assert.match(reply, /^Готово/m, `the class is authored: ${ask}`);
    assert.match(reply, new RegExp(race), `the named race is honoured: ${ask}`);
    assert.doesNotMatch(reply, /назови расу/, `no question when the race is named: ${ask}`);
  }
});

test('a class built for a ready race follows that race\'s nature', () => {
  // A fire race ("Пепельники") must not draw a random kit: the race name picks the
  // class theme.
  const made = generatedSheet([{ role: 'user', content: 'сделай класс под готовую расу Пепельники' }], {}, 'ru');
  assert.equal(made.app['Под расу'], 'Пепельники');
  assert.match(made.text, /Ресурс: Жар/, 'the fire race draws the fire class, not a random one');
});

test('a ready sheet pasted by the player is checked as its own kind', async () => {
  const sent = [];
  setNotifier(async (info) => { sent.push(info); return { ok: true }; });
  const race = 'Название: Пепельники\nСамоназвание: Тлеющие\nГде живут: выжженные пустоши\nЧем занимаются: собирают пепел\nБоевые навыки: швыряют обломки\nСпособности: Жар ядра\nУязвимости: вода и холод\nМагия: Огонь и Руны';
  const out = await answerInterview({ messages: [{ role: 'user', content: race }, { role: 'user', content: 'проверь' }], lang: 'ru' });
  assert.match(out.reply, /передан[а]? владельцу/, 'a pasted race sheet is accepted and handed off');
  assert.equal(sent[0].kind, 'race', 'the owner gets it as a race, not a character');

  const cls = 'Название класса: Гробовый певец\nРоль: призыватель\nРесурс: Кости\nБазовая атака: 3 кости\nУльтимейт: Зов гробницы\nИстощение ресурса: кости = 0';
  const out2 = await answerInterview({ messages: [{ role: 'user', content: cls }, { role: 'user', content: 'проверь' }], lang: 'ru' });
  assert.match(out2.reply, /передан[а]? владельцу/, 'a pasted class sheet is accepted and handed off');
  assert.equal(sent[1].kind, 'class', 'the owner gets it as a class');
  setNotifier(null);
});

test('asking twice gives a stable sheet, and a different request a different one', () => {
  const a = localInterview({ messages: [{ role: 'user', content: 'придумай мне расу сам' }], lang: 'ru', application: {} });
  const b = localInterview({ messages: [{ role: 'user', content: 'придумай мне расу сам' }], lang: 'ru', application: {} });
  assert.equal(a, b, 'the same request does not reroll the sheet under the player');
  const c = localInterview({ messages: [{ role: 'user', content: 'создай расу сама, только про болото' }], lang: 'ru', application: {} });
  assert.notEqual(a, c, 'a different request can give a different race');
});

test('the interviewer understands the typos players actually type', () => {
  // The owner typed "рассу" and the old pattern only knew "расу", so the request
  // fell through to the character walk. These spellings must all build a sheet.
  for (const ask of ['можешь создать рассу для меня сам', 'создай рассу сам', 'придумай мне рассу', 'создай мне клас', 'можешь создать клас для меня', 'создай мне класc сам']) {
    const reply = localInterview({ messages: [{ role: 'user', content: ask }], lang: 'ru', application: {} });
    assert.match(reply, /Готово/, `"${ask}" builds a race or class`);
    assert.doesNotMatch(reply, /Расскажи про «/, `"${ask}" must not fall back to a field question`);
  }
});

test('a plain question about a race stays a question, not a build request', () => {
  for (const ask of ['расскажи про расу', 'расскажи про рассу', 'что такое класс', 'какие есть расы']) {
    const reply = localInterview({ messages: [{ role: 'user', content: ask }], lang: 'ru', application: {} });
    assert.doesNotMatch(reply, /Готово/, `"${ask}" is not treated as "make me one"`);
  }
});

test('the interviewer reacts to what was said instead of only asking a field', () => {
  const reply = localInterview({ messages: [{ role: 'user', content: 'Меня зовут Лира, я эльфийка-маг' }], lang: 'ru', application: {} });
  assert.match(reply, /Записал|деталь|Отлично/, 'a real answer gets a human reaction');
  assert.match(reply, /«/, 'the next field is still asked');
});

test('asking how to make a race is answered, not met with another field question', () => {
  const reply = localInterview({ messages: [{ role: 'user', content: 'а как мне создать расу?' }], lang: 'ru', application: {} });
  assert.match(reply, /придумай мне расу сам|двумя путями/, 'the two ways are explained');
});

test('the interviewer offers to finish the sheet itself partway through', () => {
  const app = { _kind: 'race', 'Название': 'Тени', 'Где живут': 'в пещерах' };
  const history = [
    { role: 'user', content: 'Хочу создать свою расу' },
    { role: 'assistant', content: 'Давай сделаем расу...' },
    { role: 'user', content: 'Название: Тени, живут в пещерах' }
  ];
  const reply = localInterview({ messages: history, lang: 'ru', application: app });
  assert.match(reply, /придумаю остальное за тебя/, 'the handover is offered');
  // And the offer leads straight to a generated sheet.
  history.push({ role: 'assistant', content: reply }, { role: 'user', content: 'придумай мне рассу сам' });
  assert.match(localInterview({ messages: history, lang: 'ru', application: app }), /Готово/);
});

test('"finish it for me" mid-walk generates the rest and keeps the player\'s answers', async () => {
  // The owner's exact complaint: after "Хорошо... Можешь сам всё дальше придумать?"
  // the bot answered "Хороший вопрос" and offered the same handover back. It must
  // author the sheet and keep the name the player already chose.
  const sent = [];
  setNotifier(async (info) => { sent.push(info); return { ok: true }; });
  const app = { _kind: 'race', 'Название': 'лёд', 'Самоназвание': 'Сухие', 'Внешность': 'сухая кожа' };
  const messages = [{ role: 'user', content: 'Хорошо... Можешь сам всё дальше придумать?' }];
  const first = await answerInterview({ messages, lang: 'ru', application: app });
  assert.match(first.reply, /Готово/, 'the rest is authored');
  assert.doesNotMatch(first.reply, /Хороший вопрос/, 'not the generic non-answer');
  assert.equal(first.application['Название'], 'лёд', 'the player\'s own name is kept');
  assert.equal(first.application['Внешность'], 'сухая кожа', 'the player\'s own look is kept');
  assert.ok(first.application['Уязвимости'], 'the balance rules supply the missing fields');

  messages.push({ role: 'assistant', content: first.reply }, { role: 'user', content: 'проверь' });
  const second = await answerInterview({ messages, lang: 'ru', application: first.application });
  assert.match(second.reply, /передан[а]? владельцу/, 'the finished sheet is handed off');
  assert.equal(sent[0].title, 'лёд', 'the owner gets the name the player chose');
  setNotifier(null);
});

test('a finish request is only read as one when it really asks for the rest', () => {
  const race = { _kind: 'race', 'Название': 'Тени' };
  const at = (text) => finishSheet([{ role: 'user', content: text }], race, 'ru');
  for (const ask of ['Можешь сам всё дальше придумать?', 'придумай остальное сам', 'доделай за меня', 'можешь придумать всё сам']) {
    assert.ok(at(ask), `"${ask}" hands the rest over`);
  }
  // An ordinary answer that merely contains "сами" is not a handover.
  for (const ask of ['Они сами по себе живут в горах', 'мы сами решим свою судьбу', 'хочу расу']) {
    assert.equal(at(ask), null, `"${ask}" is not a handover`);
  }
  // Outside a race/class walk nothing is generated, even with the same words.
  assert.equal(finishSheet([{ role: 'user', content: 'Можешь сам всё дальше придумать?' }], { _kind: 'character' }, 'ru'), null);
});

test('a rename request changes the sheet instead of being ignored', async () => {
  // The owner's exact complaint: "Давай поменяем название на «лёд»?" was answered
  // with "Хороший вопрос" and the next field, so nothing changed. The edit must be
  // stored and confirmed.
  const sent = [];
  setNotifier(async (info) => { sent.push(info); return { ok: true }; });
  const app = {
    _kind: 'race', 'Название': 'Костяные', 'Самоназвание': 'Сухие', 'Внешность': 'сухая кожа',
    'Где живут': 'склепы', 'Чем занимаются': 'охраняют могилы', 'Боевые навыки': 'медленно',
    'Способности': 'шёпот мёртвых', 'Уязвимости': 'свет; серебро'
  };
  const messages = [{ role: 'user', content: 'Давай поменяем название на «лёд»?' }];
  const first = await answerInterview({ messages, lang: 'ru', application: app });
  assert.match(first.reply, /Записал: Название → «лёд»/, 'the rename is confirmed');
  assert.doesNotMatch(first.reply, /Хороший вопрос/, 'not the generic non-answer');
  assert.equal(first.application['Название'], 'лёд', 'the new name is stored in the draft');

  messages.push({ role: 'assistant', content: first.reply }, { role: 'user', content: 'проверь' });
  const second = await answerInterview({ messages, lang: 'ru', application: first.application });
  assert.match(second.reply, /передан[а]? владельцу/, 'the renamed sheet is handed off');
  assert.equal(sent[0].title, 'лёд', 'the owner receives the renamed sheet');
  setNotifier(null);
});

test('a field edit names the field and the value, and leaves answers alone', () => {
  const race = { _kind: 'race', 'Название': 'Костяные' };
  assert.deepEqual(parseFieldEdit('переименуй расу в Морозники', race), { field: 'Название', value: 'Морозники' });
  assert.deepEqual(parseFieldEdit('смени внешность на бледную кожу', race), { field: 'Внешность', value: 'бледную кожу' });
  assert.deepEqual(parseFieldEdit('поменяй уязвимости на огонь и соль', race), { field: 'Уязвимости', value: 'огонь и соль' });
  // A plain answer or a question is not a revision.
  assert.equal(parseFieldEdit('Название: Тени', race), null);
  assert.equal(parseFieldEdit('а какая магия им подойдёт?', race), null);
  assert.equal(parseFieldEdit('Они живут на севере и охотятся на льду', race), null);
});

test('a race idea the player brings is built around that idea, not ignored', () => {
  // The owner's exact complaint: a player opens with "полу люди, полу нежить" and
  // the Interviewer answered with a form that ignored the idea. It must build the
  // race from the idea and quote it back.
  const ask = 'Хорошо. У меня есть идея для рассы. Хочу что бы это были полу люди, полу нежить. Сможешь сделать рассу такую?';
  const reply = localInterview({ messages: [{ role: 'user', content: ask }], lang: 'ru', application: {} });
  assert.match(reply, /Готово/, 'the race is built from the idea, not met with a form');
  assert.doesNotMatch(reply, /Расскажи про «Название»/, 'the player is not asked for a name they did not offer');
  assert.match(reply, /Идея игрока: .*нежить/, 'the player\'s own idea is kept in the sheet');
  assert.match(reply, /Уязвимости: .+;/, 'the race still has its two weaknesses');
  // The undead idea picks the skeletal theme, not a random one.
  assert.match(reply, /Название: (Костяные|Гробовники)/, 'the theme matches the idea');
});

test('an idea with no nature words still opens the walk', () => {
  for (const ask of ['Хочу создать расу', 'Можно свою расу?']) {
    const reply = localInterview({ messages: [{ role: 'user', content: ask }], lang: 'ru', application: {} });
    assert.match(reply, /анкету расы/, `"${ask}" opens the race walk`);
    assert.doesNotMatch(reply, /Готово/, `"${ask}" does not invent a race`);
  }
});

test('a race built from the player\'s idea is stored and handed off on "проверь"', async () => {
  const sent = [];
  setNotifier(async (info) => { sent.push(info); return { ok: true }; });
  const messages = [{ role: 'user', content: 'Хочу расу полулюди-полунежить, живут в склепах' }];
  const first = await answerInterview({ messages, lang: 'ru' });
  assert.match(first.reply, /Готово/, 'the idea is built into a race');
  assert.equal(first.application._kind, 'race');
  assert.ok(first.application['Идея игрока'], 'the player\'s idea is stored in the draft');
  assert.ok(first.application['Уязвимости'], 'the weaknesses are stored too');

  messages.push({ role: 'assistant', content: first.reply }, { role: 'user', content: 'проверь' });
  const second = await answerInterview({ messages, lang: 'ru', application: first.application });
  assert.match(second.reply, /передан[а]? владельцу/, 'the idea-based race is accepted and handed off');
  assert.equal(sent.length, 1, 'it is sent to the owner');
  assert.equal(sent[0].kind, 'race');
  setNotifier(null);
});

test('a generated race respects the balance rules it is built from', () => {
  for (const seedText of ['расу сам', 'другую расу придумай', 'создай расу сама', 'make a race for me']) {
    const reply = localInterview({ messages: [{ role: 'user', content: seedText }], lang: 'ru', application: {} });
    // At least two weaknesses, a habitat and a society: the race rules the owner set.
    assert.match(reply, /Уязвимости:/, `"${seedText}" names weaknesses`);
    assert.match(reply, /Где живут:/, `"${seedText}" names a habitat`);
    assert.match(reply, /Общественное устройство:/, `"${seedText}" describes a society`);
    // No race may claim every school of magic.
    assert.match(reply, /Магия: владеют — .+; не владеют — .+/, `"${seedText}" limits magic to two schools`);
  }
});

