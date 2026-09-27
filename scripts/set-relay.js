#!/usr/bin/env node
// Points the public static site at the owner's server, without exposing the bot.
//
// GitHub Pages cannot run a server, so the page cannot hold the bot token. Instead
// it posts its notifications to the owner's own server, which relays them to
// Telegram. Only the relay address and the relay key end up in the public file;
// the key is useless without the server, so the bot stays private.
//
// Usage:
//   node scripts/set-relay.js https://deeprealm-site.onrender.com
//   RELAY_KEY=... node scripts/set-relay.js https://deeprealm-site.onrender.com
//
// The key is read from RELAY_KEY (or .env) because it exists so it is not typed
// twice and stays identical on both sides.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fromEnvFile(key) {
  const file = path.join(root, '.env');
  if (!fs.existsSync(file)) return '';
  const line = fs.readFileSync(file, 'utf8').split('\n').find((l) => l.trim().startsWith(`${key}=`));
  return line ? line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') : '';
}

const url = String(process.argv[2] || '').trim().replace(/\/+$/, '');
if (!/^https?:\/\//.test(url)) {
  console.error('Укажи адрес сервера, например:');
  console.error('  node scripts/set-relay.js https://deeprealm-site.onrender.com');
  process.exit(1);
}

const key = (process.env.RELAY_KEY || fromEnvFile('RELAY_KEY') || '').trim();
if (!key) {
  console.error('Нет RELAY_KEY. Возьми его из переменных сервера (Render → Environment)');
  console.error('или из своего .env, затем повтори запуск:');
  console.error('  RELAY_KEY=<ключ> node scripts/set-relay.js ' + url);
  process.exit(2);
}

const config = {
  _instructions: 'Открытый файл: токена бота здесь нет. relay.url — адрес сервера, relay.key — общий ключ RELAY_KEY на сервере. Браузер передаёт уведомления серверу, а сервер отправляет их в Telegram.',
  relay: { url, key }
};

for (const target of ['data/telegram.json', 'docs/data/telegram.json']) {
  fs.writeFileSync(path.join(root, target), `${JSON.stringify(config, null, 2)}\n`);
  console.log(`обновлён ${target}`);
}

// A quick check that the relay on that server accepts this key.
const res = await fetch(`${url}/api/notify`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Relay-Key': key },
  body: JSON.stringify({ type: 'visit', session: 'setup-check', page: 'setup', device: 'setup script' })
}).catch((err) => ({ ok: false, status: 0, _err: err }));

if (res && res.ok) {
  console.log('Сервер принял уведомление — проверь свой Telegram (должно прийти «Новый заход»).');
} else {
  const status = res ? res.status : 0;
  console.error(`Сервер ответил ${status || res?._err?.message || 'ошибка'}.`);
  console.error(status === 401 ? 'Ключ не совпал: проверь RELAY_KEY на сервере.' : 'Проверь, что сервер запущен и адрес верный.');
  process.exit(3);
}
