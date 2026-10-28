// The empty bot template must stay runnable and must keep its token out of the
// repository: the entry point takes TELEGRAM_BOT_TOKEN from the environment only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createBot } from '../bot-template/bot.js';

const dir = path.resolve(import.meta.dirname, '..', 'bot-template');

function collector() {
  const sent = [];
  return { sent, send: (chatId, text, replyTo) => sent.push({ chatId, text, replyTo }) };
}

test('the template replies to /start and /ping', async () => {
  const c = collector();
  const bot = createBot({ send: c.send });
  await bot.handleUpdate({ message: { message_id: 1, chat: { id: 5 }, text: '/start' } });
  await bot.handleUpdate({ message: { message_id: 2, chat: { id: 5 }, text: '/ping' } });
  assert.match(c.sent[0].text, /бот-заготовка/);
  assert.equal(c.sent[0].replyTo, 1);
  assert.equal(c.sent[1].text, 'pong');
});

test('the template ignores a message with no text', async () => {
  const c = collector();
  const bot = createBot({ send: c.send });
  await bot.handleUpdate({ message: { message_id: 1, chat: { id: 5 } } });
  await bot.handleUpdate({});
  assert.equal(c.sent.length, 0);
});

test('the template ships no token and reads it from the environment', () => {
  const entry = fs.readFileSync(path.join(dir, 'index.js'), 'utf8');
  assert.match(entry, /process\.env\.TELEGRAM_BOT_TOKEN/);
  assert.doesNotMatch(entry, /\d{6,}:[A-Za-z0-9_-]{30,}/);
});
