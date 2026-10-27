// The RP dice bot as a Cloudflare Worker.
//
// Telegram pushes each update to this Worker's URL (a webhook), so - unlike a
// free Render instance - it is always on and answers the instant a player posts.
// The bot's behaviour is the same code the Node process runs (../../bot/bot.js),
// bundled in at deploy time by build.mjs; only the store differs, backed by KV.
//
// Secrets, set with `wrangler secret put` or the dashboard (never committed):
//   TELEGRAM_RP_BOT_TOKEN  - the @BotFather token
//   TELEGRAM_WEBHOOK_SECRET - a random string Telegram echoes back on each call
//
// The KV namespace binding is RP_PLAYERS (see wrangler.toml).

import { createBot } from '../../../bot/bot.js';
import { kvStore } from './kv-store.js';

const API = 'https://api.telegram.org';

async function send(token, chatId, text, replyTo) {
  await fetch(`${API}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...(replyTo ? { reply_to_message_id: replyTo, allow_sending_without_reply: true } : {}),
      disable_web_page_preview: true
    })
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET') {
      // A quick liveness probe that does not touch Telegram.
      return json({ ok: true, rev: 1, service: 'deeprealm-rp-bot' });
    }

    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    // Telegram echoes the secret we registered, so a stranger cannot make the bot
    // spend tokens by posting here directly.
    const secret = env.TELEGRAM_WEBHOOK_SECRET;
    if (secret && request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== secret) {
      return new Response('Forbidden', { status: 403 });
    }

    let update;
    try {
      update = await request.json();
    } catch {
      return new Response('Bad Request', { status: 400 });
    }

    const token = String(env.TELEGRAM_RP_BOT_TOKEN || '').trim();
    if (!token) return json({ ok: false, reason: 'no token' }, 500);

    const store = kvStore(env.RP_PLAYERS);
    const bot = createBot({
      store,
      send: (chatId, text, replyTo) => send(token, chatId, text, replyTo)
    });

    try {
      await bot.handleUpdate(update);
    } catch (err) {
      // Answer 200 anyway: Telegram retries a non-2xx, and a retry of a bad
      // update would only loop. The error is logged in the Worker's tail.
      console.error('update failed:', err && err.message);
    }
    return json({ ok: true });
  }
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
