import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApiPublisher } from '../github-publish-api.js';

// A stand-in for the GitHub Contents API. It keeps file text in memory so a test
// exercises the publisher's real request/response handling without touching the
// network or a live repository.
function fakeApi() {
  const files = new Map();
  const requests = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', () => {
      const url = new URL(req.url, 'http://localhost');
      requests.push({ method: req.method, path: url.pathname });
      const key = url.pathname;
      if (req.method === 'GET') {
        if (!files.has(key)) { res.writeHead(404); return res.end('{}'); }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ sha: 'sha-' + key, content: Buffer.from(files.get(key)).toString('base64') }));
      }
      if (req.method === 'PUT') {
        const body = JSON.parse(raw);
        files.set(key, Buffer.from(body.content, 'base64').toString('utf8'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ content: { sha: 'sha-' + key } }));
      }
      res.writeHead(405); res.end('{}');
    });
  });
  return { server, files, requests };
}

function workspace(articles) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dr-api-'));
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs', 'data'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data', 'articles.json'), JSON.stringify(articles));
  return root;
}

async function withApi(fn) {
  const api = fakeApi();
  await new Promise((r) => api.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${api.server.address().port}`;
  try {
    return await fn(api, base);
  } finally {
    await new Promise((r) => api.server.close(r));
  }
}

test('an approved article is written to both repository paths', async () => {
  await withApi(async (api, base) => {
    const root = workspace({ articles: [{ title: 'Old', body: 'x' }] });
    const pub = createApiPublisher({ root, repo: 'owner/repo', token: 't', apiBase: base });
    const res = await pub.sync({ message: 'Publish approved' });
    assert.equal(res.ok, true, `expected ok, got ${JSON.stringify(res)}`);
    assert.equal(res.reason, 'pushed');

    // The server keeps the source of truth; the page reads the docs copy. Both
    // must carry the new article or one of them goes stale.
    const source = JSON.parse(api.files.get('/repos/owner/repo/contents/data/articles.json'));
    const published = JSON.parse(api.files.get('/repos/owner/repo/contents/docs/data/articles.json'));
    assert.equal(source.articles[0].title, 'Old');
    assert.equal(published.articles[0].title, 'Old');
  });
});

test('the published copy on disk matches what was sent', async () => {
  await withApi(async (api, base) => {
    const root = workspace({ articles: [{ title: 'Kukly', body: 'y' }] });
    const pub = createApiPublisher({ root, repo: 'owner/repo', token: 't', apiBase: base });
    await pub.sync({ message: 'Publish approved' });
    const disk = fs.readFileSync(path.join(root, 'docs', 'data', 'articles.json'), 'utf8');
    assert.match(disk, /Kukly/);
  });
});

test('an unchanged file is not rewritten', async () => {
  await withApi(async (api, base) => {
    const root = workspace({ articles: [{ title: 'Same', body: 'z' }] });
    const pub = createApiPublisher({ root, repo: 'owner/repo', token: 't', apiBase: base });
    await pub.sync({ message: 'first' });
    const writesAfterFirst = api.requests.filter((r) => r.method === 'PUT').length;
    const again = await pub.sync({ message: 'second' });
    assert.equal(again.reason, 'already_published');
    const writesAfterSecond = api.requests.filter((r) => r.method === 'PUT').length;
    assert.equal(writesAfterSecond, writesAfterFirst, 'a no-op publish must not write again');
  });
});

test('publishing is skipped when it is switched off or unconfigured', async () => {
  await withApi(async (api, base) => {
    const root = workspace({ articles: [] });
    const off = createApiPublisher({ root, repo: 'owner/repo', token: 't', enabled: false, apiBase: base });
    assert.equal((await off.sync({ message: 'x' })).reason, 'disabled');

    const noToken = createApiPublisher({ root, repo: 'owner/repo', token: '', apiBase: base });
    assert.equal((await noToken.sync({ message: 'x' })).reason, 'not_configured');
    assert.equal(api.requests.length, 0, 'nothing must be sent when unconfigured');
  });
});

test('an API failure is reported instead of thrown', async () => {
  const root = workspace({ articles: [{ title: 'A' }] });
  const pub = createApiPublisher({ root, repo: 'owner/repo', token: 't', apiBase: 'http://127.0.0.1:1' });
  const res = await pub.sync({ message: 'x' });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'api_failed');
});
