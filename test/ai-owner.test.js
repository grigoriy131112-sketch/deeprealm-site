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
  sentToOwnerText, applicationTitle, staffAnswerPairs, setKnowledge, findRole
} from '../chat-core.js';
import { setNotifier, answerInterview, answerStaff } from '../chat-answers.js';

// These tests run against the real knowledge base, so the reply texts and the
// scripted questions are the ones the site actually uses.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
setKnowledge(JSON.parse(fs.readFileSync(path.join(root, 'data', 'knowledge.json'), 'utf8')));

// A filled-in sheet followed by "проверь", which is how the built-in Interviewer
// reaches its verdict when no model is present.
const SHEET = 'Имя: Лира. Раса: Эльф. Класс: Маг. Характер: спокойная, есть слабость к огню.';
const APPROVED_DIALOGUE = [
  { role: 'user', content: SHEET },
  { role: 'assistant', content: 'Расскажи ещё что-нибудь о персонаже.' },
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
  const messages = [{ role: 'user', content: 'хочу быть модератором' }];
  for (const q of role.questions) {
    messages.push({ role: 'assistant', content: q });
    messages.push({ role: 'user', content: 'готов, отвечаю по делу' });
  }
  const out = await answerStaff({ messages, lang: 'ru' });
  assert.equal(out.done, true);
  assert.equal(sent.length, 1, 'one message carries the whole interview');
  assert.equal(sent[0].answers.length, role.questions.length, 'every question is paired');
  assert.match(out.reply, /Все ответы отправлены владельцу/);
  setNotifier(null);
});
