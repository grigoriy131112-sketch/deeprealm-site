// Pushes a newly approved race or class article to GitHub, so it appears on the
// permanent site and not only on the server that published it.
//
// The permanent site (GitHub Pages) is served from `docs/`, which is built from
// `data/articles.json`. Writing the article to disk is therefore not enough: the
// committed copy and the built site must be updated too, or the article is lost
// on the next redeploy and never reaches visitors.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

// Runs a command and resolves with its output; never rejects, because publishing
// to the site must not be able to break the player's onboarding reply.
function run(cmd, args, opts) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', (err) => resolve({ code: -1, out: String(err.message) }));
    child.on('close', (code) => resolve({ code, out }));
  });
}

function tokenFromRemote(remote) {
  const m = String(remote || '').match(/https:\/\/([^@]+)@github\.com/);
  if (!m) return '';
  return m[1].replace(/^[^:]*:/, '');
}

// Turns a git remote into a push URL. A GitHub HTTPS remote gets the token
// embedded; any other remote (a local path, an already-authenticated SSH host)
// is used as-is, so the same code works in tests without a real credential.
function pushUrl(remote, token) {
  const onGithub = /github\.com/.test(remote) && /^https?:\/\//.test(remote);
  if (!onGithub) return { url: remote, needsToken: false };
  const slug = remote.replace(/^https?:\/\//, '').replace(/^[^@]*@/, '').replace(/^github\.com\//, '').replace(/\.git$/, '');
  return { url: `https://${token}@github.com/${slug}.git`, needsToken: true, slug: `github.com/${slug}` };
}


export function createGithubPublisher({ root, token = '', branch = 'main', enabled = true, log = () => {} }) {
  const repoRoot = root;

  // Tests and local runs must never commit to a live repository, so publishing
  // can be switched off entirely through configuration.
  const active = enabled;

  // The repo URL is read from git itself, so no extra variable is needed when
  // the checkout already carries a token in origin.
  async function remoteUrl() {
    const { code, out } = await run('git', ['remote', 'get-url', 'origin'], { cwd: repoRoot });
    return code === 0 ? out.trim() : '';
  }

  async function tokenFor(remote) {
    if (token) return token;
    return tokenFromRemote(remote); // already embedded in origin
  }

  // Publishes whatever is currently in `data/articles.json` plus the rebuilt
  // `docs/`. Returns a small result object instead of throwing on failure: the
  // caller only needs to know whether the site caught up.
  async function sync({ message }) {
    if (!active) return { ok: false, reason: 'disabled' };
    if (!fs.existsSync(path.join(repoRoot, '.git'))) {
      return { ok: false, reason: 'not_a_git_checkout' };
    }
    const remote = await remoteUrl();
    if (!remote) return { ok: false, reason: 'no_remote' };
    const auth = await tokenFor(remote);
    const target = pushUrl(remote, auth);
    if (target.needsToken && !auth) return { ok: false, reason: 'no_token' };

    // Rebuild the published site from the freshly written articles file.
    const build = await run('node', ['scripts/build-pages.js'], { cwd: repoRoot });
    if (build.code !== 0) return { ok: false, reason: 'build_failed', detail: build.out.trim().slice(-300) };

    const add = await run('git', ['add', 'data/articles.json', 'docs'], { cwd: repoRoot });
    if (add.code !== 0) return { ok: false, reason: 'git_add_failed', detail: add.out.trim().slice(-300) };

    // Nothing staged means the article was already published before.
    const staged = await run('git', ['diff', '--cached', '--quiet'], { cwd: repoRoot });
    if (staged.code === 0) return { ok: true, reason: 'already_published' };

    const commit = await run('git', ['-c', 'user.name=deeprealm-bot', '-c', 'user.email=bot@deeprealm.local', 'commit', '-m', message], { cwd: repoRoot });
    if (commit.code !== 0) return { ok: false, reason: 'commit_failed', detail: commit.out.trim().slice(-300) };

    const push = await run('git', ['push', target.url, `HEAD:${branch}`], { cwd: repoRoot });
    if (push.code !== 0) {
      return { ok: false, reason: 'push_failed', detail: push.out.replace(target.url, '***').trim().slice(-300) };
    }
    log(`article published to ${target.slug || remote} (${branch})`);
    return { ok: true, reason: 'pushed' };
  }

  return { sync, remoteUrl };
}
