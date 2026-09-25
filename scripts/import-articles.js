// One-off import: copies every blog article into data/articles.json so the site
// serves them itself. Run with: node scripts/import-articles.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchArticles } from '../articles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'data', 'articles.json');

const articles = await fetchArticles();
if (!articles.length) {
  console.error('No articles fetched - nothing written.');
  process.exit(1);
}

const payload = {
  source: 'https://deeprealm1.blogspot.com/',
  imported_at: new Date().toISOString(),
  articles
};
fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');

const byKind = articles.reduce((acc, a) => { acc[a.kind] = (acc[a.kind] || 0) + 1; return acc; }, {});
console.log(`Imported ${articles.length} articles into ${path.relative(process.cwd(), OUT)}`);
console.log('By kind:', JSON.stringify(byKind));
