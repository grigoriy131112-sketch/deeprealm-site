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
import { localInterview } from '../ai-engine.js';
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
  assert.match(ok, /Анкета отправлена владельцу/);
  const failed = sentToOwnerText('interview', 'ru', { delivered: false });
  assert.match(failed, /не удалось/);
  assert.match(failed, /@Omega_Gribcha/, 'the owner contact is repeated so a sheet is not lost');
  const staffOk = sentToOwnerText('staff', 'ru', { delivered: true });
  assert.match(staffOk, /Все ответы отправлены владельцу/);
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
  assert.match(out.reply, /Анкета отправлена владельцу/);
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
  assert.match(out.reply, /Все ответы отправлены владельцу/);
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
  assert.match(out.reply, /Сюжет отправлен владельцу/);
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
  assert.match(approved, /ОДОБРЕНО/, 'a filled race sheet is approved');
});

test('a thin race sheet is not approved and is not filed as a character', async () => {
  const thin = localInterview({ messages: [{ role: 'user', content: 'проверь' }], lang: 'ru', application: { _kind: 'race', 'Название': 'Тени' } });
  assert.doesNotMatch(thin, /ОДОБРЕНО/, 'one field is not enough for a race');
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

test('the interviewer authors a class itself with a cooldown on every ability', () => {
  const reply = localInterview({ messages: [{ role: 'user', content: 'создай мне класс сам' }], lang: 'ru', application: {} });
  assert.match(reply, /Готово/, 'the class is built on request');
  assert.match(reply, /Название класса:/, 'the class is named');
  assert.match(reply, /Перезарядка:/, 'cooldowns are given in turns');
  assert.match(reply, /Истощение ресурса:/, 'the resource exhaustion rule is stated');
  assert.doesNotMatch(reply, /Расскажи про «/, 'the player is not sent back to the checklist');
  // Every ability and both ultimates carry a cooldown, which is the rule the owner asked for.
  const cooldowns = (reply.match(/Перезарядка:/g) || []).length;
  const abilities = (reply.match(/Ур\. \d+:/g) || []).length;
  assert.equal(cooldowns, abilities + 2, 'each of the 12 abilities and both ultimates has a cooldown');
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
  assert.match(second.reply, /ОДОБРЕНО/, 'the generated race passes the check');
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
  assert.match(second.reply, /ОДОБРЕНО/, 'the generated class passes the check');
  assert.equal(sent.length, 1, 'the generated class is sent to the owner');
  assert.equal(sent[0].kind, 'class');
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

