#!/usr/bin/env node
// One-time Telegram bot setup for the owner.
//
// The awkward part of the README's two-step instructions is finding the chat id:
// the owner has to message a stranger's bot (@userinfobot) and copy a number out
// of it. This script removes that step. Give it the bot token from @BotFather,
// send the bot any message, and it reads the id from the bot's own updates and
// writes it into data/telegram.json.
//
// Usage:
//   node scripts/setup-telegram.js <token> [extra-chat-id,...]
//   node scripts/setup-telegram.js --token <token> --to 123,456

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = path.join(root, '.env');
const API = 'https://api.telegram.org';

// Upsert into .env so an existing bot token is replaced rather than duplicated.
function writeEnv(values) {
  const current = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
  const lines = current.split('\n').filter((l) => l.trim() !== '');
  const kept = lines.filter((l) => !Object.prototype.hasOwnProperty.call(values, l.split('=')[0].trim()));
  for (const [key, value] of Object.entries(values)) {
    if (value === '') continue;
    kept.push(`${key}=${value}`);
  }
  fs.writeFileSync(ENV_FILE, `${kept.join('\n')}\n`, { mode: 0o600 });
  try { fs.chmodSync(ENV_FILE, 0o600); } catch { /* not fatal on every filesystem */ }
}

function parseArgs(argv) {
  const out = { token: '', to: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--token') out.token = argv[++i] || '';
    else if (a === '--to') out.to = argv[++i] || '';
    else if (!out.token) out.token = a;
    else if (!out.to) out.to = a;
  }
  return out;
}

async function api(token, method) {
  const res = await fetch(`${API}/bot${token}/${method}`);
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.ok !== true) {
    throw new Error(body && body.description ? body.description : `telegram ${res.status}`);
  }
  return body.result;
}

async function main() {
  const { token, to } = parseArgs(process.argv.slice(2));
  if (!token) {
    console.error('Укажи токен бота от @BotFather:');
    console.error('  node scripts/setup-telegram.js 123456:ABC...');
    process.exit(1);
  }

  const me = await api(token, 'getMe');
  console.log(`Бот: @${me.username} (${me.first_name})`);

  const extra = String(to || '').split(',').map((s) => s.trim()).filter(Boolean);
  let chatIds = extra;

  if (!chatIds.length) {
    // The id only appears in getUpdates after someone writes to the bot, so a
    // freshly created bot has nothing to read yet.
    const updates = await api(token, 'getUpdates');
    const found = [];
    for (const u of updates) {
      const chat = u.message?.chat || u.edited_message?.chat || u.channel_post?.chat;
      const id = chat && String(chat.id);
      if (id && !found.includes(id)) found.push(id);
    }
    if (!found.length) {
      console.error('');
      console.error(`Напиши боту @${me.username} любое сообщение (например «привет») и запусти скрипт снова.`);
      console.error('Telegram не показывает id, пока боту никто не написал.');
      process.exit(2);
    }
    chatIds = found;
    console.log(`Нашёл получателя: ${chatIds.join(', ')}`);
  }

  writeEnv({
    TELEGRAM_BOT_TOKEN: token,
    TELEGRAM_CHAT_ID: chatIds[0],
    TELEGRAM_CHAT_IDS: chatIds.slice(1).join(',')
  });
  console.log(`Записал в ${path.relative(root, ENV_FILE)} (файл в .gitignore, в GitHub не попадёт)`);

  const sent = await fetch(`${API}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatIds[0], text: 'Deeprealm: уведомления подключены ✅' })
  });
  const body = await sent.json().catch(() => null);
  if (!body || body.ok !== true) {
    console.error(`Не удалось отправить проверочное сообщение: ${body?.description || sent.status}`);
    process.exit(3);
  }
  console.log('Проверочное сообщение отправлено — уведомления работают.');
}

main().catch((err) => {
  console.error(`Ошибка: ${err.message}`);
  process.exit(1);
});
