// The approved-sheet feature only helps if the article reaches the permanent
// site. These tests use a real git repository and a real local remote, so the
// commit, the build and the push are all exercised instead of stubbed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createGithubPublisher } from '../github-publish.js';
import { createArticleStore } from '../article-store.js';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });

function scaffold() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dr-pub-'));
  const repo = path.join(base, 'repo');
  const bare = path.join(base, 'site.git');
  fs.mkdirSync(path.join(repo, 'data'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'public'), { recursive: true });

  // The bare repo stands in for GitHub: it is a real remote to push into.
  git(base, 'init', '--bare', bare);
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.name', 'test');
  git(repo, 'config', 'user.email', 'test@test');
  git(repo, 'remote', 'add', 'origin', bare);

  // Only the files the publisher touches are needed.
  for (const f of ['public/index.html', 'public/styles.css', 'public/app.js', 'public/scene.js', 'public/favicon.svg']) {
    fs.copyFileSync(path.join(process.cwd(), f), path.join(repo, f));
  }
  fs.copyFileSync(path.join(process.cwd(), 'scripts/build-pages.js'), path.join(repo, 'scripts/build-pages.js'));
  fs.copyFileSync(path.join(process.cwd(), 'knowledge-view.js'), path.join(repo, 'knowledge-view.js'));
  // build-pages.js imports the view from the parent of scripts/.
  fs.copyFileSync(path.join(process.cwd(), 'data/knowledge.json'), path.join(repo, 'data/knowledge.json'));
  fs.writeFileSync(path.join(repo, 'data/articles.json'), JSON.stringify({ source: '', imported_at: null, articles: [] }));

  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'initial');
  git(repo, 'push', 'origin', 'main');
  return { base, repo, bare };
}

test('an approved article is committed, built into docs/ and pushed', async () => {
  const { repo, bare } = scaffold();
  const store = createArticleStore(path.join(repo, 'data/articles.json'));
  store.publish({ title: 'Стеклянные', kind: 'race', text: 'Раса из стекла' });

  const publisher = createGithubPublisher({ root: repo, branch: 'main' });
  const result = await publisher.sync({ message: 'Publish race "Стеклянные"' });
  assert.equal(result.ok, true, JSON.stringify(result));

  // The remote really received the article, not just the local checkout.
  const pushed = JSON.parse(git(bare, 'show', 'main:data/articles.json'));
  assert.equal(pushed.articles.length, 1, 'the article must be on the remote');
  assert.equal(pushed.articles[0].title, 'Стеклянные');

  // And the published site was rebuilt from it.
  const built = JSON.parse(git(bare, 'show', 'main:docs/data/articles.json'));
  assert.equal(built.articles.length, 1, 'the built site must carry the article too');
  assert.ok(git(bare, 'ls-tree', '--name-only', 'main:docs').includes('index.html'), 'the site page must be published');
});

test('publishing the same article twice does not push an empty commit', async () => {
  const { repo } = scaffold();
  const store = createArticleStore(path.join(repo, 'data/articles.json'));
  store.publish({ title: 'Стеклянные', kind: 'race', text: 'Раса из стекла' });

  const publisher = createGithubPublisher({ root: repo, branch: 'main' });
  assert.equal((await publisher.sync({ message: 'first' })).ok, true);
  const again = await publisher.sync({ message: 'second' });
  assert.equal(again.reason, 'already_published', 'an unchanged file must not be committed again');
});

test('a GitHub remote without a token reports no_token instead of failing silently', async () => {
  const { repo } = scaffold();
  git(repo, 'remote', 'set-url', 'origin', 'https://github.com/example/deeprealm-site.git');

  const publisher = createGithubPublisher({ root: repo, branch: 'main', token: '' });
  const result = await publisher.sync({ message: 'x' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no_token');
});

test('a repository that is not a checkout is refused instead of throwing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dr-plain-'));
  const publisher = createGithubPublisher({ root: dir, branch: 'main' });
  const result = await publisher.sync({ message: 'x' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'not_a_git_checkout');
});
