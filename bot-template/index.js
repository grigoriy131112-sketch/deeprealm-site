// Точка входа шаблона: длинный опрос Telegram.
//
//   TELEGRAM_BOT_TOKEN=<токен от @BotFather> node bot-template/index.js
//
// Токен берётся из окружения и никогда не пишется в репозиторий. Замени
// `createBot` на свою логику в `bot.js`.

import { createBot } from './bot.js';

const API = 'https://api.telegram.org';

export async function startBot({ token, log = console } = {}) {
  const clean = String(token || '').trim();
  if (!clean) throw new Error('Нет токена: задай TELEGRAM_BOT_TOKEN.');

  async function call(method, body) {
    const res = await fetch(`${API}/bot${clean}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    return res.json();
  }

  function send(chatId, text, replyTo) {
    return call('sendMessage', {
      chat_id: chatId,
      text,
      ...(replyTo ? { reply_to_message_id: replyTo, allow_sending_without_reply: true } : {}),
      disable_web_page_preview: true
    });
  }

  const bot = createBot({ send });

  const me = await call('getMe', {});
  if (!me.ok) throw new Error('Telegram отклонил токен: ' + (me.description || ''));
  log.log(`Бот @${me.result.username} на связи.`);

  let offset = 0;
  (async function loop() {
    for (;;) {
      try {
        const res = await call('getUpdates', { offset, timeout: 30, allowed_updates: ['message'] });
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

  return { me: me.result, bot };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startBot({ token: process.env.TELEGRAM_BOT_TOKEN }).catch((err) => {
    console.error(err && err.message);
    process.exit(1);
  });
}
