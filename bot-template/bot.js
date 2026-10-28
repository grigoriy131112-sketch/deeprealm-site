// Шаблон бота: поведение отдельно от Telegram, чтобы его можно было проверять
// без сети. `createBot` принимает `send(chatId, text, replyTo)` и возвращает
// `handleUpdate` — функцию, которая только решает, что ответить.
//
// Это пустой каркас. Допиши свои команды в `handleUpdate`; больше здесь ничего
// менять не нужно.

const HELP = [
  'Привет! Я бот-заготовка.',
  'Команды:',
  '• /start — это сообщение.',
  '• /ping — проверка связи.'
].join('\n');

export function createBot({ send } = {}) {
  async function reply(chatId, text, replyTo) {
    return send(chatId, text, replyTo);
  }

  async function handleUpdate(update) {
    const message = update && update.message;
    if (!message || !message.text) return;

    const chatId = message.chat.id;
    const text = message.text.trim();
    const replyTo = message.message_id;

    if (text === '/start' || text === '/help') return reply(chatId, HELP, replyTo);
    if (text === '/ping') return reply(chatId, 'pong', replyTo);

    // Допиши свои команды здесь.
  }

  return { handleUpdate };
}
