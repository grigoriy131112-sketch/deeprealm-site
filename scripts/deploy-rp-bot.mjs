// Deploy the RP dice bot Worker and point Telegram at it.
//
// Everything secret comes from the environment, never from this file:
//   CLOUDFLARE_API_TOKEN   - token with Workers Scripts:Edit + KV:Edit
//   CLOUDFLARE_ACCOUNT_ID
//   TELEGRAM_RP_BOT_TOKEN  - @BotFather token for @koobboobbot
//   TELEGRAM_WEBHOOK_SECRET- any random string; Telegram echoes it back
//   RP_KV_ID               - the RP_PLAYERS KV namespace id
//
//   node scripts/deploy-rp-bot.mjs
//
// It builds the bundle, uploads it with its bindings, makes sure the workers.dev
// subdomain is on, and sets the webhook.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = 'deeprealm-rp-bot';
const KV_ID = process.env.RP_KV_ID;

const need = (name) => {
  const v = (process.env[name] || '').trim();
  if (!v) throw new Error(`Задай ${name}`);
  return v;
};

const account = need('CLOUDFLARE_ACCOUNT_ID');
const cfToken = need('CLOUDFLARE_API_TOKEN');
const botToken = need('TELEGRAM_RP_BOT_TOKEN');
const webhookSecret = need('TELEGRAM_WEBHOOK_SECRET');
if (!KV_ID) throw new Error('Задай RP_KV_ID');

const CF = `https://api.cloudflare.com/client/v4/accounts/${account}`;

async function cf(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${cfToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json();
  if (!data.success) throw new Error(`${method} ${url}: ${JSON.stringify(data.errors)}`);
  return data.result;
}

// 1. Bundle.
execFileSync(process.execPath, [path.join(ROOT, 'deploy/cloudflare/rp-bot/build.mjs')], { stdio: 'inherit' });

// 2. Upload with its bindings. The module is sent as multipart so the token and
// the webhook secret never appear in a JSON body we might log.
const meta = {
  main_module: 'worker.js',
  compatibility_date: '2026-09-27',
  bindings: [
    { type: 'kv_namespace', name: 'RP_PLAYERS', namespace_id: KV_ID },
    { type: 'plain_text', name: 'TELEGRAM_WEBHOOK_SECRET', text: webhookSecret },
    { type: 'secret_text', name: 'TELEGRAM_RP_BOT_TOKEN', text: botToken }
  ]
};
const form = new FormData();
form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }), 'metadata.json');
form.append('worker.js', new Blob([fs.readFileSync(path.join(ROOT, 'deploy/cloudflare/rp-bot/dist/worker.js'))], { type: 'application/javascript+module' }), 'worker.js');
const upload = await fetch(`${CF}/workers/scripts/${SCRIPT}`, { method: 'PUT', headers: { Authorization: `Bearer ${cfToken}` }, body: form });
const up = await upload.json();
if (!up.success) throw new Error('upload: ' + JSON.stringify(up.errors));
console.log('Worker загружен.');

// 3. Make sure it is reachable at <name>.<subdomain>.workers.dev.
await cf('POST', `${CF}/workers/scripts/${SCRIPT}/subdomain`, { enabled: true, previews_enabled: false });

// 4. Point Telegram at it.
const url = `https://${SCRIPT}.grigoriy131112.workers.dev/`;
const hook = await (await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url, secret_token: webhookSecret, allowed_updates: ['message', 'edited_message', 'callback_query'], drop_pending_updates: true })
})).json();
if (!hook.ok) throw new Error('setWebhook: ' + JSON.stringify(hook));
console.log('Вебхук поставлен на', url);
