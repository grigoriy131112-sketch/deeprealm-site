// The long-poll loop, shared by the standalone entry point (bot/index.js) and
// the site server, so the bot can ride along on the same always-on process as
// the site instead of needing a second host.
//
// `startBot` never throws into the caller: a bad token or a Telegram hiccup is
// logged and retried, so a broken bot can never take the site down with it.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.js';
import { createBot } from './bot.js';

const API = 'https://api.telegram.org';
const HERE = path.dirname(fileURLToPath(import.meta.url));

export function defaultStoreFile() {
  return process.env.RP_STORE || path.join(HERE, 'data', 'players.json');
}

export async function startBot({ token, storeFile = defaultStoreFile(), log = console } = {}) {
  const clean = String(token || '').trim();
  if (!clean) throw new Error('Нет токена: задай TELEGRAM_RP_BOT_TOKEN.');

  const store = createStore(storeFile);

  async function call(method, body) {
    const res = await fetch(`${API}/bot${clean}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    return res.json();
  }

  function send(chatId, text, replyTo, threadId) {
    return call('sendMessage', {
      chat_id: chatId,
      text,
      ...(replyTo ? { reply_to_message_id: replyTo, allow_sending_without_reply: true } : {}),
      ...(threadId ? { message_thread_id: threadId } : {}),
      disable_web_page_preview: true
    });
  }

  const bot = createBot({ store, send });

  const me = await call('getMe', {});
  if (!me.ok) throw new Error('Telegram отклонил токен: ' + (me.description || ''));

  const started = { username: me.result.username, players: Object.keys(store.all()).length };
  log.log(`RP-бот @${me.result.username} на связи. Игроков в базе: ${started.players}.`);

  let offset = 0;
  (async function loop() {
    for (;;) {
      try {
        const res = await call('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'edited_message'] });
        if (!res.ok) {
          log.error('getUpdates:', res.description);
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        for (const update of res.result) {
          offset = update.update_id + 1;
          try {
            await bot.handleUpdate(update);
          } catch (err) {
            log.error('update', update.update_id, err && err.message);
          }
        }
      } catch (err) {
        log.error('poll:', err && err.message);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  })();

  return { me: me.result, store, bot, started };
}
