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

async function send(token, chatId, text, replyTo, threadId, keyboard) {
  const res = await fetch(`${API}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...(replyTo ? { reply_to_message_id: replyTo, allow_sending_without_reply: true } : {}),
      ...(threadId ? { message_thread_id: threadId } : {}),
      ...(keyboard ? { reply_markup: keyboard } : {}),
      disable_web_page_preview: true
    })
  });
  // Telegram answers 200 with {"ok":true} or a 4xx with the reason (blocked bot,
  // wrong chat, bad token). Surface it instead of dropping it, or a bot that
  // never answers looks like a bot that was never called.
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.ok !== true) {
    const why = (body && body.description) || `http ${res.status}`;
    console.error('sendMessage failed:', why);
    return { ok: false, error: why };
  }
  return { ok: true };
}

// Rewriting the menu message in place: one menu, not a stack of copies.
async function editMessage(token, chatId, messageId, text, keyboard) {
  const res = await fetch(`${API}/bot${token}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      ...(keyboard ? { reply_markup: keyboard } : {}),
      disable_web_page_preview: true
    })
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.ok !== true) {
    const why = (body && body.description) || `http ${res.status}`;
    console.error('editMessageText failed:', why);
    return { ok: false, error: why };
  }
  return { ok: true };
}

// Stops the button's spinner; Telegram expects it after every button press.
async function answerCallback(token, callbackQueryId) {
  await fetch(`${API}/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId })
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET') {
      // A quick liveness probe that does not touch Telegram. The rev is a deploy
      // marker: bump it on every behaviour change so the owner can confirm a
      // redeploy actually reached the live worker.
      return json({ ok: true, rev: 8, service: 'deeprealm-rp-bot' });
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
    const sends = [];
    const edits = [];
    const bot = createBot({
      store,
      send: async (chatId, text, replyTo, threadId, keyboard) => {
        const r = await send(token, chatId, text, replyTo, threadId, keyboard);
        sends.push(r.ok ? 'ok' : r.error);
        return r;
      },
      editMessage: async (chatId, messageId, text, keyboard) => {
        const r = await editMessage(token, chatId, messageId, text, keyboard);
        edits.push(r.ok ? 'ok' : r.error);
        return r;
      },
      answerCallback: (callbackQueryId) => answerCallback(token, callbackQueryId)
    });

    try {
      await bot.handleUpdate(update);
    } catch (err) {
      // Answer 200 anyway: Telegram retries a non-2xx, and a retry of a bad
      // update would only loop. The error is logged in the Worker's tail.
      console.error('update failed:', err && err.message);
      return json({ ok: true, error: String(err && err.message) });
    }
    // The replies and in-place edits, so a webhook test can tell "answered" from
    // "silently dropped".
    return json({ ok: true, replies: sends.length, results: sends, edits: edits.length, editResults: edits });
  }
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
