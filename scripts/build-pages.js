// Builds the `docs/` folder that GitHub Pages serves.
//
// The site is normally run by server.js, which answers /api. Pages cannot run a
// server, so the same frontend is shipped together with the JSON it needs and
// works from relative paths instead. Everything here is a copy; nothing is
// generated, which keeps the published site identical to the local one.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { knowledgeView } from '../knowledge-view.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs');

const files = [
  ['public/index.html', 'index.html'],
  ['public/styles.css', 'styles.css'],
  ['public/app.js', 'app.js'],
  ['public/scene.js', 'scene.js'],
  ['public/chat-browser.js', 'chat-browser.js'],
  ['public/favicon.svg', 'favicon.svg'],
  ['public/404.html', '404.html'],
  ['public/worker-copy.html', 'worker-copy.html'],
  // Served next to the copy page so it is fetched from the same site, which
  // avoids a stale CDN copy standing in the way of a fresh token.
  ['deploy/cloudflare/worker.js', 'worker.js'],
  ['data/articles.json', 'data/articles.json'],
  // Optional: when the owner has not configured the bot yet the file may be
  // absent, and the site simply has no notifications.
  ['data/telegram.json', 'data/telegram.json', { optional: true }]
];

// Keep the checkout clean: rebuild from scratch so a deleted file cannot linger.
fs.rmSync(out, { recursive: true, force: true });

for (const [from, to, opts] of files) {
  const src = path.join(root, from);
  const dest = path.join(out, to);
  if (!fs.existsSync(src)) {
    if (opts && opts.optional) continue;
    throw new Error(`missing source: ${from}`);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

// The browser expects the reshaped payload, not the raw file, so the static
// build runs the same view the server uses instead of shipping the source file.
const raw = JSON.parse(fs.readFileSync(path.join(root, 'data/knowledge.json'), 'utf8'));
fs.writeFileSync(path.join(out, 'data/knowledge.json'), JSON.stringify(knowledgeView(raw), null, 2) + '\n');

// The chats read the file in its stored shape, so the browser gets that too. It is
// what lets the site answer when no server is running.
fs.writeFileSync(path.join(out, 'data/knowledge.raw.json'), JSON.stringify(raw, null, 2) + '\n');

// Pages serves static files only; a config file avoids Jekyll touching anything.
fs.writeFileSync(path.join(out, '.nojekyll'), '');

const articles = JSON.parse(fs.readFileSync(path.join(out, 'data/articles.json'), 'utf8')).articles || [];
console.log(`docs/ ready: ${files.length} files, ${articles.length} articles`);
