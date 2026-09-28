// Reads the player-made races and classes straight from the Deeprealm blog.
//
// The blog is the owner's source of truth: a race or a class exists once it is
// published there and listed on one of the two index pages ("Рассы игроков" and
// "Классы игроков"). Reading those pages when the site loads is what makes a
// newly published post appear on the Races or Classes page without a rebuild, a
// commit or a server.
//
// The blog's Atom feed is the only machine-readable view of it, and it has two
// properties this file relies on:
//   - `path=<post path>` returns that single post, about 4 KB, instead of the
//     whole blog at 580 KB. That is what keeps a check cheap.
//   - `alt=json-in-script&callback=` wraps the JSON in a function call, so a
//     browser can read the feed with a <script> tag. Blogger sends no CORS
//     header, so JSONP is the only way a static GitHub Pages site can read it.
//
// Nothing here depends on Node, so the same file is bundled for the browser.

const FEED = 'https://deeprealm1.blogspot.com/feeds/posts/default';

// The blog post path inside a full blog URL: '/2026/08/blog-post_304.html'. The
// feed addresses a single post by this path.
export function blogPath(url) {
  const m = String(url || '').match(/\/(\d{4}\/\d{2}\/[^/?#]+\.html?)\b/);
  return m ? `/${m[1]}` : '';
}

// A feed URL for one post. With `callback` the response is wrapped in a function
// call (JSONP); without it, plain JSON for a server-side fetch.
export function feedUrl(path, callback) {
  const base = `${FEED}?alt=${callback ? 'json-in-script' : 'json'}&max-results=1&path=${encodeURI(path)}`;
  return callback ? `${base}&callback=${encodeURIComponent(callback)}` : base;
}

export function stripTags(html, { collapse = true } = {}) {
  const text = String(html)
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…');
  return collapse ? text.replace(/\s+/g, ' ').trim() : text;
}

// The blog keeps one <p> per visual line, so each paragraph becomes one line and
// the box-drawing separators in a class sheet stay where the author put them.
export function htmlToText(html) {
  return stripTags(
    String(html)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6])>/gi, '\n'),
    { collapse: false }
  )
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Index pages read like: "1. Класс: <a href=...>Название</a><br/>Создатель: @user".
// The wording varies ("Расса", "Расс", "Клас"), so every spelling is accepted.
const ENTRY_RE = /(?:Класс|Расса|Расс|Раса|Клас)\s*:(?:\s|&nbsp;)*<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:Создатель|Основател)[^@]*@([A-Za-z0-9_]+)/gi;

export function parseIndexEntries(html) {
  const entries = [];
  const seen = new Set();
  for (const match of String(html || '').matchAll(ENTRY_RE)) {
    const url = match[1].trim();
    const name = stripTags(match[2]);
    const author = '@' + match[3];
    if (!name || seen.has(name)) continue;
    seen.add(name);
    entries.push({ name, author, url });
  }
  return entries;
}

// One post, reduced to what the site shows: title, address and readable text.
export function parsePostFeed(feed) {
  const entry = feed && feed.feed && Array.isArray(feed.feed.entry) ? feed.feed.entry[0] : null;
  if (!entry) return null;
  const title = stripTags(entry.title && entry.title.$t ? entry.title.$t : '');
  const html = (entry.content && entry.content.$t) || (entry.summary && entry.summary.$t) || '';
  const links = Array.isArray(entry.link) ? entry.link : [];
  const url = (links.find((l) => l && l.rel === 'alternate') || {}).href || '';
  return { title, url, text: htmlToText(html) };
}

// The live list is preferred, but a post the owner removed from the index should
// not vanish while the snapshot still lists it, so the two are merged. Names are
// compared case-insensitively: the blog mixes "разумный слайм" and "Разумный слайм".
export function mergeEntries(live, snapshot) {
  const out = [];
  const seen = new Set();
  for (const e of [...(Array.isArray(live) ? live : []), ...(Array.isArray(snapshot) ? snapshot : [])]) {
    const name = String((e && e.name) || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, author: String((e && e.author) || ''), url: String((e && e.url) || '') });
  }
  return out;
}

// `loadJson(path)` returns the feed object for one post. It is injected so the
// browser can pass a JSONP loader and a test a plain fetch.
export async function readIndex({ indexUrl, loadJson, log = () => {} }) {
  const path = blogPath(indexUrl);
  if (!path || typeof loadJson !== 'function') return { entries: [], live: false };
  try {
    const feed = await loadJson(path);
    const html = (feed && feed.feed && feed.feed.entry && feed.feed.entry[0] && feed.feed.entry[0].content && feed.feed.entry[0].content.$t) || '';
    return { entries: parseIndexEntries(html), live: true };
  } catch (err) {
    log(`blog index ${path} unavailable: ${(err && err.message) || err}`);
    return { entries: [], live: false };
  }
}

export async function readPost({ url, loadJson }) {
  const path = blogPath(url);
  if (!path || typeof loadJson !== 'function') return null;
  const post = parsePostFeed(await loadJson(path));
  // A missing link is filled from the address that was asked for, so the entry
  // still points somewhere even if the feed omitted the alternate link.
  return post ? { ...post, url: post.url || String(url || '') } : null;
}

// The browser loader: one <script> per post, removed as soon as it answers. A
// timeout and an onerror both reject, so a blocked or slow blog never leaves the
// page waiting.
export function createJsonpLoader({ timeoutMs = 15000, doc = typeof document !== 'undefined' ? document : null, win = typeof window !== 'undefined' ? window : null } = {}) {
  if (!doc || !win) return null;
  let seq = 0;
  return function loadJson(path) {
    return new Promise((resolve, reject) => {
      const name = `__drBlog${Date.now().toString(36)}${seq++}`;
      const script = doc.createElement('script');
      let done = false;
      const timer = setTimeout(() => finish(new Error('blog timeout')), timeoutMs);
      function finish(err, data) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { delete win[name]; } catch { win[name] = undefined; }
        if (script.parentNode) script.parentNode.removeChild(script);
        if (err) reject(err);
        else resolve(data);
      }
      win[name] = (data) => finish(null, data);
      script.onerror = () => finish(new Error('blog unreachable'));
      script.src = feedUrl(path, name);
      doc.head.appendChild(script);
    });
  };
}
