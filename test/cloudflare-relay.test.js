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
      request('POST', { headers: { 'X-Relay-Key': 'deeprealm' }, body: { type: 'visit' } }),
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
    request('POST', { headers: { 'X-Relay-Key': 'deeprealm' }, body: { type: 'visit' } }),
    {}
  );
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, telegram: false });
});

test('a mistyped dashboard key does not lock the relay out', async () => {
  // The built-in key stays valid, so an error while copying the value into the
  // dashboard cannot stop notifications.
  const stub = stubTelegram();
  try {
    const res = await worker.fetch(
      request('POST', { headers: { 'X-Relay-Key': 'deeprealm' }, body: { type: 'visit' } }),
      { TELEGRAM_BOT_TOKEN: 'T', RELAY_KEY: '09cc2fb19a331b59-opytka' }
    );
    assert.equal(res.status, 200);
    assert.equal((await res.json()).telegram, true);
  } finally {
    stub.restore();
  }
});

test('a dashboard key is accepted as well', async () => {
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

test('an unrelated key is still refused', async () => {
  const res = await worker.fetch(
    request('POST', { headers: { 'X-Relay-Key': 'something-else' }, body: { type: 'visit' } }),
    { TELEGRAM_BOT_TOKEN: 'T' }
  );
  assert.equal(res.status, 401);
});

test('the token is found under a differently spelled variable name', async () => {
  // Variables are typed by hand, so accept common spellings instead of one exact
  // name. This is what stops a working setup from silently sending nothing.
  for (const name of ['TELEGRAM_BOT_TOKEN', 'Telegram_Bot_Token', 'BOT_TOKEN', 'TOKEN']) {
    const stub = stubTelegram();
    try {
      const res = await worker.fetch(
        request('POST', { headers: { 'X-Relay-Key': 'deeprealm' }, body: { type: 'visit' } }),
        { [name]: 'T' }
      );
      assert.equal((await res.json()).telegram, true, `a token stored as ${name} was not used`);
    } finally {
      stub.restore();
    }
  }
});

test('the token is found by its shape even under an unexpected name', async () => {
  const stub = stubTelegram();
  try {
    const res = await worker.fetch(
      request('POST', { headers: { 'X-Relay-Key': 'deeprealm' }, body: { type: 'visit' } }),
      { TELEGRAM_X: '123456789:AAExampleTokenForTestsOnly1234567' }
    );
    assert.equal((await res.json()).telegram, true);
  } finally {
    stub.restore();
  }
});

test('the helper page fills the token line instead of shipping the token', async () => {
  // The public page must carry no token; it writes one into the fetched source.
  const page = fs.readFileSync(new URL('../public/worker-copy.html', import.meta.url), 'utf8');
  assert.equal(/\d{6,}:[A-Za-z0-9_-]{30,}/.test(page), false, 'the page ships a token');
  assert.match(page, /DEFAULT_TOKEN = ''/, 'the page no longer replaces the token line');

  const source = fs.readFileSync(new URL('../deploy/cloudflare/worker.js', import.meta.url), 'utf8');
  const fake = '123456789:AAExampleTokenForTestsOnly1234567';
  const filled = source.replace("const DEFAULT_TOKEN = '';", "const DEFAULT_TOKEN = '" + fake + "';");
  assert.notEqual(filled, source, 'the token line was not found in the Worker');
  assert.ok(filled.includes(fake));
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
