import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { app } from '../server.js';

// A missing page must never reach the visitor as a bare "Cannot GET" or a raw
// Express error page; these checks keep that from coming back.

function listen() {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function get(server, url) {
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}${url}`);
  const body = await res.text();
  return { status: res.status, type: res.headers.get('content-type') || '', body };
}

test('an unknown API route answers with JSON, not an HTML error page', async () => {
  const server = await listen();
  try {
    const res = await get(server, '/api/no-such-endpoint');
    assert.equal(res.status, 404);
    assert.match(res.type, /application\/json/, 'the frontend parses this as JSON');
    assert.equal(JSON.parse(res.body).error, 'not_found');
  } finally {
    server.close();
  }
});

test('a missing file shows the themed page instead of a plain error', async () => {
  const server = await listen();
  try {
    const res = await get(server, '/no-such-file.png');
    assert.equal(res.status, 404);
    assert.match(res.body, /Страница не найдена/);
  } finally {
    server.close();
  }
});

test('a deep link without the hash still opens the app', async () => {
  const server = await listen();
  try {
    const res = await get(server, '/races');
    assert.equal(res.status, 200);
    assert.match(res.body, /<html/i);
  } finally {
    server.close();
  }
});

test('the build publishes the 404 page alongside the site', () => {
  const page = path.join(process.cwd(), 'docs', '404.html');
  assert.ok(fs.existsSync(page), 'docs/404.html must exist, or Pages shows its own error');
  const html = fs.readFileSync(page, 'utf8');
  assert.match(html, /На главную/);
  assert.match(html, /deeprealm-site/, 'the links must be absolute: Pages serves the page from any depth');
});

test('the build script copies every file the 404 page needs', () => {
  const build = fs.readFileSync(path.join(process.cwd(), 'scripts', 'build-pages.js'), 'utf8');
  assert.match(build, /public\/404\.html/, 'build-pages.js must list the 404 page');
});
