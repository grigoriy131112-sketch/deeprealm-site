// Publishes an approved article straight through the GitHub API.
//
// The git-based publisher cannot work inside the deployed container: the image
// has no git binary and excludes `.git`, so there is nothing to commit into.
// This path writes the same two files with the Contents API instead, which also
// means no checkout, no build step and no token-in-URL on disk.
//
// `data/articles.json` is the source of truth; `docs/data/articles.json` is the
// copy the published page reads. The build script copies the file verbatim, so
// the same bytes go to both paths.
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_API = 'https://api.github.com';

async function gh(base, token, method, url, body) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'deeprealm-site',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }
  return { ok: res.ok, status: res.status, json };
}

export function createApiPublisher({ root, repo, token, branch = 'main', enabled = true, apiBase = DEFAULT_API, log = () => {} }) {
  const articlesFile = path.join(root, 'data', 'articles.json');
  const publishedFile = path.join(root, 'docs', 'data', 'articles.json');
  const paths = ['data/articles.json', 'docs/data/articles.json'];

  // The current file is fetched first because the API needs its sha to update an
  // existing file; a missing file is created without one. The same response
  // carries the current text, which tells us whether a write is needed at all.
  async function readRemote(filePath) {
    const url = `/repos/${repo}/contents/${filePath}?ref=${encodeURIComponent(branch)}`;
    const { ok, status, json } = await gh(apiBase, token, 'GET', url);
    if (ok && json?.sha) {
      const text = json.content ? Buffer.from(json.content, 'base64').toString('utf8') : '';
      return { sha: json.sha, text };
    }
    if (status === 404) return { sha: null, text: null };
    throw new Error(`cannot read ${filePath}: ${status}`);
  }

  async function put(filePath, content, sha, message) {
    const body = { message, content: Buffer.from(content).toString('base64'), branch };
    if (sha) body.sha = sha;
    const url = `/repos/${repo}/contents/${filePath}`;
    const { ok, status, json } = await gh(apiBase, token, 'PUT', url, body);
    if (!ok) throw new Error(`cannot write ${filePath}: ${status} ${json?.message || ''}`.trim());
    return true;
  }

  async function sync({ message }) {
    if (!enabled) return { ok: false, reason: 'disabled' };
    if (!repo || !token) return { ok: false, reason: 'not_configured' };
    if (!fs.existsSync(articlesFile)) return { ok: false, reason: 'no_articles_file' };
    const text = fs.readFileSync(articlesFile, 'utf8');

    try {
      // Both paths get the same bytes, so the published page shows exactly what
      // the server answers. An unchanged file is skipped instead of rewritten.
      let wrote = false;
      for (const filePath of paths) {
        const remote = await readRemote(filePath);
        if (remote.text !== text) {
          await put(filePath, text, remote.sha, message);
          wrote = true;
        }
        if (filePath === 'docs/data/articles.json') {
          fs.mkdirSync(path.dirname(publishedFile), { recursive: true });
          fs.writeFileSync(publishedFile, text);
        }
      }
      if (!wrote) return { ok: true, reason: 'already_published' };
      log(`article published through the GitHub API (${repo}@${branch})`);
      return { ok: true, reason: 'pushed' };
    } catch (err) {
      return { ok: false, reason: 'api_failed', detail: String(err.message).slice(-300) };
    }
  }

  return { sync };
}
