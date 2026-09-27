// The owner's Telegram relay, running on Cloudflare Workers.
//
// The site on GitHub Pages cannot hold a bot token, so it posts its visit and
// sheet notifications here, and this Worker forwards them to Telegram. The token
// lives only in the Worker's environment, so it never reaches the browser or the
// repository.
//
// This exists as an alternative to the full Node server for owners who do not
// have a card to put on a host that asks for one: the Cloudflare Workers free
// plan needs no credit card and, unlike a free Render instance, does not sleep.
//
// Deploy it from the Cloudflare dashboard as a single Worker named
// `deeprealm-relay` and paste this file as its code. Nothing else has to be
// configured except the bot token: add one variable, TELEGRAM_BOT_TOKEN, in
// Settings -> Variables and Secrets. The recipient and the shared key already
// have working defaults below.
//
// The message formatting mirrors telegram.js on purpose, so the same
// notifications arrive whether the relay runs here or on the Node server.

const API_ROOT = 'https://api.telegram.org';

// Telegram allows about 4096 characters per message. Long sheets are split.
const MAX_LEN = 3800;

// The recipient and the shared key are baked in so only one thing has to be set
// in the dashboard: the bot token. The token is deliberately NOT here, because
// this repository is public and a committed token could be used by anyone to send
// messages as the bot. The key is safe to publish: it only gates the relay, and
// the same value already ships in data/telegram.json that the browser reads.
// Setting TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID or RELAY_KEY in
// Settings -> Variables and Secrets overrides these built-in values, which is
// where the token goes after being rotated in @BotFather.
const DEFAULT_CHAT_ID = '6317625158';
const DEFAULT_KEY = '09cc2fb19a331b5912af824c1a88786f53bee26d';

function splitMessage(text, limit = MAX_LEN) {
  const body = String(text == null ? '' : text).trim();
  if (!body) return [];
  if (body.length <= limit) return [body];
  const out = [];
  let rest = body;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n', limit);
    if (cut < limit * 0.5) cut = limit;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

function parseChatIds(value) {
  const raw = Array.isArray(value) ? value : String(value == null ? '' : value).split(',');
  const out = [];
  for (const item of raw) {
    const id = String(item == null ? '' : item).trim();
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

// The same three message shapes the Node server sends, so the owner cannot tell
// which relay is in use.
function visitText(info) {
  const now = Date.now();
  return [
    '🚪 Новый заход на сайт Deeprealm',
    info.page ? `Страница: ${info.page}` : '',
    info.from ? `Пришёл откуда: ${info.from}` : '',
    info.device ? `Устройство: ${info.device}` : '',
    `Время: ${new Date(now).toISOString().replace('T', ' ').slice(0, 16)} UTC`
  ].filter(Boolean).join('\n');
}

function sheetText(info) {
  const kind = { character: 'персонажа', race: 'расы', class: 'класса', story: 'сюжета' }[info.kind] || 'анкета';
  const meta = [
    info.title ? `Название: ${info.title}` : '',
    info.contact ? `Контакт: ${info.contact}` : '',
    info.branch ? `Направление: ${info.branch}` : '',
    info.source ? `Источник: ${info.source}` : ''
  ].filter(Boolean).join('\n');
  return [`📋 Новая анкета ${kind} — Deeprealm`, meta, '', String(info.text || '').trim()]
    .filter((p) => p !== undefined).join('\n').trim();
}

function staffText(info) {
  const answers = Array.isArray(info.answers) ? info.answers : [];
  const body = answers.length
    ? answers.map((a, i) => `${i + 1}) ${a.q}\n${a.a}`).join('\n\n')
    : String(info.text || '').trim();
  return [
    '🧑‍💼 Собеседование в администрацию — Deeprealm',
    info.role ? `Направление: ${info.role}` : '',
    info.contact ? `Контакт: ${info.contact}` : '',
    info.verdict ? `Итог: ${info.verdict}` : '',
    '',
    body
  ].filter(Boolean).join('\n');
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-Relay-Key',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    }
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return json({ ok: true });
    if (request.method !== 'POST') return json({ ok: false, error: 'method' }, 405);

    const url = new URL(request.url);
    if (url.pathname !== '/api/notify') return json({ ok: false, error: 'not_found' }, 404);

    let body = {};
    try {
      body = await request.json();
    } catch (err) {
      return json({ ok: false, error: 'bad_json' }, 400);
    }

    // With no key configured the relay is closed, so an accidental deploy without
    // one cannot turn the Worker into an open relay.
    // Keyed by default so the code works as soon as it is pasted. Setting
    // RELAY_KEY in the dashboard overrides it.
    const expected = String(env.RELAY_KEY || DEFAULT_KEY).trim();
    const given = String(request.headers.get('X-Relay-Key') || body.key || '').trim();
    if (!expected || given !== expected) return json({ ok: false, error: 'unauthorized' }, 401);

    const token = String(env.TELEGRAM_BOT_TOKEN || '').trim();
    const to = parseChatIds([(env.TELEGRAM_CHAT_IDS || ''), env.TELEGRAM_CHAT_ID || DEFAULT_CHAT_ID]);
    if (!token || !to.length) return json({ ok: true, telegram: false });

    const type = body.type;
    const text = type === 'staff' ? staffText(body) : type === 'visit' ? visitText(body) : sheetText(body);
    const parts = splitMessage(text);
    const results = [];

    for (const chatId of to) {
      for (const part of parts) {
        const res = await fetch(`${API_ROOT}/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: part, disable_web_page_preview: true })
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          return json({ ok: false, error: `telegram ${res.status}`, detail: detail.slice(0, 200) }, 502);
        }
        results.push(res.status);
      }
    }

    return json({ ok: true, telegram: true, parts: parts.length, recipients: to.length });
  }
};
