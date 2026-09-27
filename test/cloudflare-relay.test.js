// The Cloudflare Worker relay is a second implementation of the same endpoint the
// Node server exposes at /api/notify. These tests exercise the real module, with
// fetch stubbed so no message is actually sent, and check that a notification is
// refused unless the shared key matches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../deploy/cloudflare/worker.js';

function request(method, { path = '/api/notify', headers = {}, body } = {}) {
  return new Request('https://relay.example' + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

// Captures what the Worker would send, and answers every call with success.
function stubTelegram() {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, payload: JSON.parse(opts.body) });
    return { ok: true, status: 200, text: async () => '' };
  };
  return {
    calls,
    restore() { globalThis.fetch = original; }
  };
}

const ENV = { TELEGRAM_BOT_TOKEN: 'T', TELEGRAM_CHAT_ID: '6317625158', RELAY_KEY: 'K' };

test('the relay rejects an unknown path and method', async () => {
  const notFound = await worker.fetch(request('POST', { path: '/other', body: {} }), ENV);
  assert.equal(notFound.status, 404);
  const method = await worker.fetch(request('GET', { path: '/api/notify' }), ENV);
  assert.equal(method.status, 405);
  const preflight = await worker.fetch(request('OPTIONS'), ENV);
  assert.equal(preflight.status, 200);
});

test('a missing or wrong key is refused', async () => {
  const missing = await worker.fetch(request('POST', { body: { type: 'visit' } }), ENV);
  assert.equal(missing.status, 401);
  const wrong = await worker.fetch(request('POST', { headers: { 'X-Relay-Key': 'other' }, body: {} }), ENV);
  assert.equal(wrong.status, 401);
});

test('the built-in key and recipient are used when only the token is set', async () => {
  const stub = stubTelegram();
  try {
    const res = await worker.fetch(
      request('POST', { headers: { 'X-Relay-Key': '09cc2fb19a331b5912af824c1a88786f53bee26d' }, body: { type: 'visit' } }),
      { TELEGRAM_BOT_TOKEN: 'T' }
    );
    assert.equal(res.status, 200);
    assert.equal((await res.json()).telegram, true);
    assert.equal(stub.calls[0].payload.chat_id, '6317625158');
  } finally {
    stub.restore();
  }
});

test('without a token the relay stays silent instead of failing', async () => {
  const res = await worker.fetch(
    request('POST', { headers: { 'X-Relay-Key': '09cc2fb19a331b5912af824c1a88786f53bee26d' }, body: { type: 'visit' } }),
    {}
  );
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, telegram: false });
});

test('a variable in the dashboard overrides the built-in value', async () => {
  const stub = stubTelegram();
  try {
    const res = await worker.fetch(
      request('POST', { headers: { 'X-Relay-Key': 'my-own-key' }, body: { type: 'visit' } }),
      { TELEGRAM_BOT_TOKEN: 'T', RELAY_KEY: 'my-own-key', TELEGRAM_CHAT_ID: '999' }
    );
    assert.equal(res.status, 200);
    assert.equal(stub.calls[0].payload.chat_id, '999');
  } finally {
    stub.restore();
  }
});

test('an override key makes the built-in key stop working', async () => {
  const res = await worker.fetch(
    request('POST', { headers: { 'X-Relay-Key': '09cc2fb19a331b5912af824c1a88786f53bee26d' }, body: { type: 'visit' } }),
    { RELAY_KEY: 'a-different-key' }
  );
  assert.equal(res.status, 401);
});

test('the public worker file never contains the bot token', async () => {
  // The repository is public, so a committed token would let anyone send messages
  // as the bot. This guards against it being pasted back in later.
  const source = fs.readFileSync(new URL('../deploy/cloudflare/worker.js', import.meta.url), 'utf8');
  assert.equal(/\d{6,}:[A-Za-z0-9_-]{30,}/.test(source), false, 'a bot token shape was found in the worker');
});

test('a visit reaches the owner with the page and device', async () => {
  const stub = stubTelegram();
  try {
    const res = await worker.fetch(
      request('POST', { headers: { 'X-Relay-Key': 'K' }, body: { type: 'visit', page: 'lore', device: 'iPad' } }),
      ENV
    );
    assert.equal(res.status, 200);
    assert.equal((await res.json()).telegram, true);
    assert.equal(stub.calls.length, 1);
    const text = stub.calls[0].payload.text;
    assert.match(text, /Новый заход на сайт Deeprealm/);
    assert.match(text, /Страница: lore/);
    assert.equal(stub.calls[0].payload.chat_id, '6317625158');
  } finally {
    stub.restore();
  }
});

test('a plot sheet arrives labelled as a plot, not as a character', async () => {
  const stub = stubTelegram();
  try {
    await worker.fetch(
      request('POST', { headers: { 'X-Relay-Key': 'K' }, body: { type: 'sheet', kind: 'story', text: 'Название: Тень' } }),
      ENV
    );
    const text = stub.calls[0].payload.text;
    assert.match(text, /Новая анкета сюжета/);
    assert.match(text, /Название: Тень/);
  } finally {
    stub.restore();
  }
});

test('a sheet longer than Telegram allows is split into several messages', async () => {
  const stub = stubTelegram();
  try {
    await worker.fetch(
      request('POST', { headers: { 'X-Relay-Key': 'K' }, body: { type: 'sheet', kind: 'character', text: 'а'.repeat(9000) } }),
      ENV
    );
    assert.ok(stub.calls.length >= 3, `expected at least 3 parts, got ${stub.calls.length}`);
    for (const call of stub.calls) assert.ok(call.payload.text.length <= 3800);
  } finally {
    stub.restore();
  }
});
