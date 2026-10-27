// The RP bot as a Cloudflare Worker: the KV store and the webhook gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { kvStore } from '../deploy/cloudflare/rp-bot/kv-store.js';
import worker from '../deploy/cloudflare/rp-bot/worker.js';

// A KV namespace fake over a Map, with the list() shape the store uses.
function fakeKV() {
  const m = new Map();
  return {
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v) { m.set(k, v); },
    async delete(k) { m.delete(k); },
    async list({ prefix = '', cursor } = {}) {
      const keys = [...m.keys()].filter((k) => k.startsWith(prefix)).sort();
      return { keys: keys.map((name) => ({ name })), list_complete: true, cursor: undefined };
    }
  };
}

const SECRET = 'test-secret';
const TOKEN = '123456789:AAExampleTokenForTestsOnly1234567';

function env(extra = {}) {
  return { RP_PLAYERS: fakeKV(), TELEGRAM_WEBHOOK_SECRET: SECRET, TELEGRAM_RP_BOT_TOKEN: TOKEN, ...extra };
}

function post(update, { secret = SECRET } = {}) {
  return new Request('https://bot.example/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(secret ? { 'X-Telegram-Bot-Api-Secret-Token': secret } : {}) },
    body: JSON.stringify(update)
  });
}

test('kvStore saves, reads and lists players', async () => {
  const store = kvStore(fakeKV());
  await store.set(5, { name: 'Аттар', stats: { strength: 8 } });
  await store.set(6, { name: 'Бо', stats: { strength: 4 } });
  assert.equal((await store.get(5)).name, 'Аттар');
  assert.equal(Object.keys(await store.all()).length, 2);
  await store.remove(5);
  assert.equal(await store.get(5), null);
});

test('the worker answers a GET probe without touching Telegram', async () => {
  const res = await worker.fetch(new Request('https://bot.example/'), env());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.service, 'deeprealm-rp-bot');
});

test('the worker rejects a POST without the Telegram secret', async () => {
  const res = await worker.fetch(post({ update_id: 1 }, { secret: null }), env());
  assert.equal(res.status, 403);
});

test('the worker rejects a POST with a wrong secret', async () => {
  const res = await worker.fetch(post({ update_id: 1 }, { secret: 'nope' }), env());
  assert.equal(res.status, 403);
});

test('the worker rolls and replies for a registered player', async () => {
  const e = env();
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
  };
  try {
    // Register in private, then roll in the group.
    await worker.fetch(post({ message: { message_id: 1, chat: { id: 5, type: 'private' }, from: { id: 5 }, text: '/reg Аттар\nСила 8, Реакция 6' } }), e);
    await worker.fetch(post({ message: { message_id: 2, chat: { id: 100, type: 'supergroup' }, from: { id: 5 }, text: 'бью /roll' } }), e);
  } finally {
    globalThis.fetch = orig;
  }
  const rolled = calls[calls.length - 1];
  assert.match(rolled.url, /sendMessage/);
  assert.equal(rolled.body.chat_id, 100);
  assert.match(rolled.body.text, /Крит-урон:/);
  assert.match(rolled.body.text, /Блок:/);
  assert.match(rolled.body.text, /Уклонение:/);
});

test('a malformed body is a 400, not a crash', async () => {
  const res = await worker.fetch(new Request('https://bot.example/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': SECRET },
    body: 'not json'
  }), env());
  assert.equal(res.status, 400);
});
