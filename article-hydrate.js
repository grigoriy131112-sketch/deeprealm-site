// Loads the canonical article list from the repository at start-up.
//
// A free host gives the container an ephemeral filesystem: `data/articles.json`
// is present at boot, but anything appended afterwards disappears when the
// service restarts or spins down, even though it was published to the
// repository. Reading the repository back on boot makes the committed copy the
// real source of truth, so a restart can never drop a player article.
const DEFAULT_API = 'https://api.github.com';

// The repository copy is merged into the store rather than replacing it: the
// store also holds articles imported from the blog at build time.
export async function hydrateArticles({ repo, token, branch = 'main', apiBase = DEFAULT_API, store, fetchImpl = fetch, log = () => {} }) {
  if (!repo || !token) return { ok: false, reason: 'not_configured' };
  try {
    const url = `${apiBase}/repos/${repo}/contents/data/articles.json?ref=${encodeURIComponent(branch)}`;
    const res = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'deeprealm-site'
      }
    });
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    const body = await res.json();
    const text = body?.content ? Buffer.from(body.content, 'base64').toString('utf8') : '';
    const parsed = JSON.parse(text);
    const articles = Array.isArray(parsed?.articles) ? parsed.articles : [];

    let added = 0;
    for (const article of articles) {
      if (!article?.title) continue;
      const known = article.slug && store.get(article.slug);
      if (!known) added += 1;
      store.upsert(article);
    }
    log(`loaded ${articles.length} articles from ${repo} (${added} new)`);
    return { ok: true, total: articles.length, added };
  } catch (err) {
    return { ok: false, reason: 'fetch_failed', detail: String(err.message).slice(-200) };
  }
}
