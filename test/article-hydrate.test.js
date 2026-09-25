import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createArticleStore } from '../article-store.js';
import { hydrateArticles } from '../article-hydrate.js';

function tempStore(seedArticles) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dr-hydrate-'));
  const seed = path.join(root, 'seed.json');
  const live = path.join(root, 'live.json');
  fs.writeFileSync(seed, JSON.stringify({ articles: seedArticles }));
  return { root, store: createArticleStore(live, { seedPath: seed }), live };
}

// Serves one article file the way the Contents API does, so the module's real
// fetch and base64 handling run.
function serveArticles(payload, status = 200) {
  const server = http.createServer((req, res) => {
    if (status !== 200) { res.writeHead(status); return res.end('{}'); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ content: Buffer.from(JSON.stringify(payload)).toString('base64') }));
  });
  return server;
}

async function withServer(server, fn) {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

test('an article published after the deploy survives a restart', async () => {
  // The container image only carries the 45 imported articles. A player article
  // approved later lives in the repository, so boot must read it back.
  const { store } = tempStore([{ slug: 'flagellant', title: 'Флагеллант', kind: 'class' }]);
  assert.equal(store.get('flagellant').title, 'Флагеллант');

  const repoPayload = { articles: [
    { slug: 'flagellant', title: 'Флагеллант', kind: 'class' },
    { slug: 'new-race', title: 'Новая раса', kind: 'race', text: 'игрок' }
  ] };

  await withServer(serveArticles(repoPayload), async (base) => {
    const res = await hydrateArticles({ repo: 'owner/repo', token: 't', apiBase: base, store });
    assert.equal(res.ok, true, `expected ok, got ${JSON.stringify(res)}`);
    assert.equal(res.added, 1, 'only the new article counts as added');
  });

  assert.equal(store.get('new-race')?.title, 'Новая раса', 'the repository article must be present after restart');
  assert.equal(store.get('flagellant')?.title, 'Флагеллант', 'existing articles must not be lost');
});

test('hydration reports a failure instead of throwing', async () => {
  const { store } = tempStore([{ slug: 'a', title: 'A', kind: 'class' }]);
  await withServer(serveArticles({}, 500), async (base) => {
    const res = await hydrateArticles({ repo: 'owner/repo', token: 't', apiBase: base, store });
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'http_500');
  });
});

test('hydration is skipped when the repository is not configured', async () => {
  const { store } = tempStore([]);
  const res = await hydrateArticles({ repo: '', token: '', store });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'not_configured');
});
