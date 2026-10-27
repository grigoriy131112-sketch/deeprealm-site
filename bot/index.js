// Standalone entry point: run the RP dice bot on its own process.
//
//   npm run bot
//
// The token comes from TELEGRAM_RP_BOT_TOKEN (the repo .env, which is
// gitignored, or the real environment); it is never written into the repository.
// When the site server runs instead, it starts the same bot from server.js, so
// only one of the two should poll at a time.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startBot } from './run.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

function loadEnvFile(file) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const key = m[1];
      const value = m[2].trim().replace(/^["']|["']$/g, '');
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // No .env is fine: the token may come from the real environment.
  }
}

loadEnvFile(path.join(ROOT, '.env'));

try {
  await startBot({ token: process.env.TELEGRAM_RP_BOT_TOKEN });
} catch (err) {
  console.error(err && err.message);
  process.exit(1);
}
