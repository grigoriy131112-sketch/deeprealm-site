// Pulls every Deeprealm article off the blog and stores it as plain text, so the
// site does not depend on the blog being reachable for the reader to work.
const FEED_URL = 'https://deeprealm1.blogspot.com/feeds/posts/default?alt=json&max-results=500';
const FETCH_TIMEOUT_MS = 30000;

function decodeEntities(html) {
  return String(html)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// The blog keeps one <p> per visual line, so each paragraph becomes one line and
// the box-drawing separators in the articles stay where the author put them.
export function htmlToText(html) {
  return decodeEntities(
    String(html)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Titles are grouped by what the article is, which drives where the site links it.
const KIND_BY_TITLE = {
  'Воин': 'class', 'Маг': 'class', 'Лучник': 'class', 'Некромант': 'class', 'Чернокнижник': 'class',
  'Арканный маг': 'class', 'Элементалист': 'class', 'Хронист/боевой маг': 'class',
  'Повелитель мёртвых': 'class', 'Лич/тёмный чародей': 'class', 'Жнец душ': 'class',
  'Демонолог': 'class', 'Кровавый маг': 'class', 'Проклинатель/колдун': 'class',
  'Стрелок/Рейнджер': 'class', 'Следопыт': 'class', 'Снайпер': 'class',
  'Капитан стражи': 'class', 'Берсерк': 'class', 'Рыцарь-защитник': 'class',
  'Магистр сфер': 'class', 'Трикстер': 'class', 'Секироносец': 'class', 'Флагеллант': 'class',
  'Разумный слайм': 'race', 'Разумные цветы': 'race', 'Синтетики': 'race', 'Куклы': 'race',
  'Человек': 'race', 'Эльфы': 'race', 'Драконорождённые': 'race', 'Дворфы': 'race',
  'Орки': 'race', 'Павшие': 'race',
  'Шаблон': 'template', 'Шаблон для расс': 'template', 'Классы и их специализации': 'class',
  'Рассы': 'race', 'Расс ы игроков': 'index', 'Рассы игроков': 'index',
  'Классы игроков': 'index', 'Персонажи игроков': 'index',
  'Пасс уровней': 'levelpass', 'Правила': 'rules', 'История мира': 'lore', 'Администрация': 'admin'
};

export function kindForTitle(title) {
  return KIND_BY_TITLE[String(title || '').trim()] || 'other';
}

function slugFromUrl(url) {
  const tail = String(url).split('/').filter(Boolean).pop() || 'article';
  return tail.replace(/\.html?$/i, '');
}

export function parseFeed(feedJson) {
  const entries = feedJson?.feed?.entry || [];
  const articles = [];
  for (const entry of entries) {
    const title = String(entry?.title?.$t || '').trim();
    const contentHtml = entry?.content?.$t || entry?.summary?.$t || '';
    const links = Array.isArray(entry?.link) ? entry.link : [];
    const url = links.find((l) => l?.rel === 'alternate')?.href || '';
    if (!title || !url) continue;
    articles.push({
      slug: slugFromUrl(url),
      title,
      url,
      kind: kindForTitle(title),
      text: htmlToText(contentHtml)
    });
  }
  return articles;
}

export async function fetchArticles(feedUrl = FEED_URL) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(feedUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'deeprealm-site/1.0' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseFeed(await res.json());
  } finally {
    clearTimeout(timer);
  }
}
