// Bundle the RP bot Worker into one file for Cloudflare.
//
// The Worker imports the shared bot core from ../../../bot, which plain
// `wrangler deploy` cannot resolve on its own (it expects node_modules). esbuild
// inlines it, so the upload is a single self-contained module.
//
//   node deploy/cloudflare/rp-bot/build.mjs
//
// Output: deploy/cloudflare/rp-bot/dist/worker.js

import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [path.join(dir, 'worker.js')],
  outfile: path.join(dir, 'dist', 'worker.js'),
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'neutral',
  mainFields: ['module', 'main'],
  // Cloudflare provides these via bindings; nothing may be pulled from Node.
  external: [],
  logLevel: 'info'
});

console.log('RP bot Worker bundled -> deploy/cloudflare/rp-bot/dist/worker.js');
