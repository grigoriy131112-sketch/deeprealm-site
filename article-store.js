import fs from 'node:fs';
import path from 'node:path';

// Articles are kept as plain text in one JSON file. The blog import fills this file
// once; approved race/class sheets are appended to it by the bot.
//
// `seedPath` matters on hosts with an ephemeral filesystem (Render free): the file at
// `filePath` can live on a mounted disk so player articles survive a redeploy, while
// the bundled copy at `seedPath` provides the 45 imported articles the first time.
export function createArticleStore(filePath, { seedPath = null } = {}) {
  let data = { source: '', imported_at: null, articles: [] };

  function load() {
    if (!fs.existsSync(filePath) && seedPath && fs.existsSync(seedPath)) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.copyFileSync(seedPath, filePath);
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (Array.isArray(parsed?.articles)) data = parsed;
    } catch {
      data = { source: '', imported_at: null, articles: [] };
    }
    return data;
  }

  function save() {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
    fs.renameSync(tmp, filePath);
  }

  function slugify(title) {
    const base = String(title)
      .toLowerCase()
      .replace(/[^a-zа-яё0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    return base || 'article';
  }

  load();

  return {
    reload: load,
    list() {
      return data.articles.map(({ slug, title, kind, url }) => ({ slug, title, kind, url: url || '' }));
    },
    get(slug) {
      return data.articles.find((a) => a.slug === slug) || null;
    },
    // A title that already exists is updated in place, so re-running the import after
    // an edit on the blog does not leave two copies of the same article.
    upsert(article) {
      const slug = article.slug || slugify(article.title);
      const idx = data.articles.findIndex((a) => a.slug === slug || a.title === article.title);
      const entry = { ...article, slug };
      if (idx >= 0) data.articles[idx] = { ...data.articles[idx], ...entry };
      else data.articles.push(entry);
      save();
      return entry;
    },
    // Publishing from the bot never overwrites a blog article: a player-created race
    // with the same name as an existing one gets its own slug.
    publish({ title, kind, text, author = '' }) {
      let slug = slugify(title);
      if (data.articles.some((a) => a.slug === slug)) slug = `${slug}-player`;
      let n = 2;
      while (data.articles.some((a) => a.slug === slug)) slug = `${slugify(title)}-player-${n++}`;
      const entry = {
        slug,
        title,
        kind,
        url: '',
        text,
        source: 'player',
        author,
        published_at: new Date().toISOString()
      };
      data.articles.push(entry);
      save();
      return entry;
    }
  };
}
