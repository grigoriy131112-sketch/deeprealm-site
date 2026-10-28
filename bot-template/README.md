# Шаблон Telegram-бота

Пустой каркас: только длинный опрос и две команды-заглушки. Скопируй папку под
нового бота и допиши свои команды в `bot.js`.

## Файлы

- `index.js` — точка входа: читает токен и крутит длинный опрос (`getUpdates`).
- `bot.js` — вся логика: `createBot({ send })` возвращает `handleUpdate`. Здесь
  и добавляй команды.

## Запуск

```bash
TELEGRAM_BOT_TOKEN=<токен от @BotFather> node bot-template/index.js
```

Токен приходит только из окружения и никогда не коммитится.

## Куда добавлять команды

В `handleUpdate` разбери `message.text` и ответь через `reply(chatId, text, replyTo)`:

```js
if (text === '/hello') return reply(chatId, 'Привет!', replyTo);
```
