import fs from 'node:fs';

const FETCH_TIMEOUT_MS = 15000;

// Pulls player-made races/classes from the Deeprealm blog index pages.
// Index pages read like: "1. Класс: <a href=...>Название</a><br/>Создатель: @user"
const BLOCK_RE = /(?:Класс|Расса|Расс|Раса|Клас)\s*:(?:\s|&nbsp;)*<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:Создатель|Основател)[^@]*@([A-Za-z0-9_]+)/gi;

function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&laquo;|&raquo;/g, '«')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parsePlayerEntries(html) {
  const entries = [];
  const seen = new Set();
  for (const match of String(html).matchAll(BLOCK_RE)) {
    const url = match[1].trim();
    const name = stripTags(match[2]);
    const author = '@' + match[3];
    if (!name || seen.has(name)) continue;
    seen.add(name);
    entries.push({ name, author, url });
  }
  return entries;
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'deeprealm-site/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// Replaces player-made entries in knowledge.json when the blog gained new ones.
// Returns { changed, racesAdded, classesAdded, errors }.
export async function syncPlayerContent(knowledgePath, sources) {
  const knowledge = JSON.parse(fs.readFileSync(knowledgePath, 'utf8'));
  const result = { changed: false, racesAdded: [], classesAdded: [], errors: [] };

  const jobs = [
    {
      url: sources.playerRaces,
      apply(entries) {
        knowledge.races.player_races = entries;
        result.racesAdded = entries.map((e) => e.name);
      }
    },
    {
      url: sources.playerClasses,
      apply(entries) {
        knowledge.classes.player_classes = entries;
        result.classesAdded = entries.map((e) => e.name);
      }
    }
  ];

  for (const job of jobs) {
    if (!job.url) continue;
    try {
      const entries = parsePlayerEntries(await fetchHtml(job.url));
      if (entries.length) job.apply(entries);
    } catch (err) {
      result.errors.push(`${job.url}: ${err.message}`);
    }
  }

  if (result.racesAdded.length || result.classesAdded.length) {
    fs.writeFileSync(knowledgePath, JSON.stringify(knowledge, null, 2) + '\n');
    result.changed = true;
  }
  return result;
}

export function defaultSources(knowledgePath) {
  const knowledge = JSON.parse(fs.readFileSync(knowledgePath, 'utf8'));
  return {
    playerRaces: knowledge.races.player_blog_link,
    playerClasses: knowledge.classes.player_blog_link
  };
}
