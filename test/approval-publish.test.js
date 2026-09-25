// End-to-end proof of the feature the owner asked for: when the interviewer
// approves a race or class, the article must end up on the permanent site.
//
// This drives the real HTTP endpoint with a real git repository behind it. The
// model is replaced by a stub, but everything else - approval detection, article
// building, the store, the build and the push - is the production path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });

// The server under test is imported after the environment points at a throwaway
// repository, so an approved sheet can never touch the real project.
async function startServer({ repoRoot, articlesPath }) {
  // NODE_ENV=test keeps the module from starting its own listener and from
  // running the blog sync, while SITE_AUTOPUBLISH=on enables the git publishing
  // the test is about. SITE_REPO_ROOT aims every write at the throwaway repo.
  process.env.NODE_ENV = 'test';
  process.env.ARTICLES_PATH = articlesPath;
  process.env.ARTICLES_SEED = path.join(repoRoot, 'data/articles.json');
  process.env.SITE_REPO_ROOT = repoRoot;
  process.env.SITE_AUTOPUBLISH = 'on';
  process.env.GITHUB_TOKEN = '';        // the local remote needs no token
  process.env.LLM_API_KEY = 'test-key';

  // A stub model: the reviewer approves, the editor returns the article JSON.
  // Only model calls are intercepted; the test's own requests to the app must
  // still reach the server, so everything else goes to the real fetch.
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    if (!String(url).includes('/chat/completions')) return realFetch(url, opts);
    const body = JSON.parse(opts.body || '{}');
    const system = String(body.messages?.[0]?.content || '');
    const content = system.includes('редактор вики')
      ? JSON.stringify({ title: 'Стеклянные', text: 'Самоназвание: Стеклянные\nУязвимость: хрупкость' })
      : 'ОДОБРЕНО. Раса прошла проверку и добавлена на сайт.';
    return { ok: true, status: 200, text: async () => '', json: async () => ({ choices: [{ message: { content } }] }) };
  };

  const mod = await import('../server.js');
  const server = mod.app.listen(0);
  return { server, port: server.address().port };
}

function scaffold() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dr-e2e-'));
  const repo = path.join(base, 'site');
  const bare = path.join(base, 'remote.git');
  for (const dir of ['public', 'scripts', 'data']) fs.mkdirSync(path.join(repo, dir), { recursive: true });

  git(base, 'init', '--bare', bare);
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.name', 'test');
  git(repo, 'config', 'user.email', 'test@test');
  git(repo, 'remote', 'add', 'origin', bare);

  const src = process.cwd();
  // Copy whole folders and every root module, not a hand-written file list: the
  // list used to miss files and the build then failed on a source it could not find.
  fs.cpSync(path.join(src, 'public'), path.join(repo, 'public'), { recursive: true });
  for (const f of fs.readdirSync(src).filter((n) => n.endsWith('.js'))) {
    fs.copyFileSync(path.join(src, f), path.join(repo, f));
  }
  fs.cpSync(path.join(src, 'scripts'), path.join(repo, 'scripts'), { recursive: true });
  fs.copyFileSync(path.join(src, 'data/knowledge.json'), path.join(repo, 'data/knowledge.json'));
  fs.writeFileSync(path.join(repo, 'data/articles.json'), JSON.stringify({ source: '', imported_at: null, articles: [] }));

  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'initial');
  git(repo, 'push', 'origin', 'main');
  return { repo, bare };
}

const RACE_SHEET = {
  messages: [{
    role: 'user',
    content: 'Хочу создать свою расу. Самоназвание: Стеклянные. Особые приметы: прозрачные. Уязвимость: огонь. Телосложение: хрупкое.'
  }],
  lang: 'ru',
  application: { race: 'Стеклянные', self_name: 'Стеклянные' }
};

test('an approved race becomes an article on the permanent site', async () => {
  const { repo, bare } = scaffold();
  const { server, port } = await startServer({
    repoRoot: repo,
    articlesPath: path.join(repo, 'data/articles.json')
  });

  const res = await fetch(`http://127.0.0.1:${port}/api/interview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(RACE_SHEET)
  });
  const data = await res.json();
  server.close();

  assert.equal(data.finale, true, 'the sheet must be treated as approved');
  assert.ok(data.published, 'the approval must publish an article');
  assert.equal(data.published.title, 'Стеклянные');

  // The decisive check: the article is on the remote, so the live site gets it.
  const onRemote = JSON.parse(git(bare, 'show', 'main:data/articles.json'));
  assert.equal(onRemote.articles.length, 1, 'the article must reach the repository');
  assert.equal(onRemote.articles[0].kind, 'race');

  // And the page the visitor loads was rebuilt from it.
  const built = JSON.parse(git(bare, 'show', 'main:docs/data/articles.json'));
  assert.equal(built.articles.length, 1, 'the published site must carry the article');
  assert.ok(git(bare, 'ls-tree', '--name-only', 'main:docs').includes('index.html'));
});

test('the article is visible through the live articles endpoint right away', async () => {
  const { repo } = scaffold();
  const { server, port } = await startServer({
    repoRoot: repo,
    articlesPath: path.join(repo, 'data/articles.json')
  });

  await fetch(`http://127.0.0.1:${port}/api/interview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(RACE_SHEET)
  });

  // The visitor's own browser reads this endpoint, so the new race must appear
  // there without a restart.
  const res = await fetch(`http://127.0.0.1:${port}/api/articles`);
  const list = await res.json();
  server.close();

  assert.ok(list.articles.some((a) => a.title === 'Стеклянные'), 'the site list must show the new race');
});
