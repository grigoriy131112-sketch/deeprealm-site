// The blog reader is what lets the static GitHub Pages site pick up a race or a
// class the owner published in the blog, with no server and no rebuild. It is a
// plain module, so it is tested directly; the JSONP transport itself needs a
// browser and is covered by the integration test in dom.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  blogPath, feedUrl, stripTags, htmlToText, parseIndexEntries, parsePostFeed,
  mergeEntries, readIndex, readPost, createJsonpLoader
} from '../blog-reader.js';

const INDEX_HTML = '1. Расса: <a href="https://deeprealm1.blogspot.com/2026/08/blog-post_28.html">Разумные цветы</a><br/>Создатель: @azemow<br/>'
  + '2. Расса: <a href="https://deeprealm1.blogspot.com/2026/08/blog-post_30.html">разумный слайм</a><br/>Основатель: @neri_moon';

const CLASS_INDEX_HTML = '1. Класс: <a href="https://deeprealm1.blogspot.com/2026/09/blog-post.html">Магистр сфер</a><br/>Создатель: @ghg23456<br/>'
  + '2. Клас: <a href="https://deeprealm1.blogspot.com/2026/09/blog-post_09.html">Трикстер</a><br/>Создатель: @LokalError';

// A feed body in the shape Blogger sends: one entry with the post HTML.
const feedFor = (title, html) => ({ feed: { entry: [{ title: { $t: title }, content: { $t: html }, link: [{ rel: 'alternate', href: 'https://deeprealm1.blogspot.com/2026/09/x.html' }] }] } });

test('a blog post address is reduced to the path the feed expects', () => {
  assert.equal(blogPath('https://deeprealm1.blogspot.com/2026/08/blog-post_28.html'), '/2026/08/blog-post_28.html');
  assert.equal(blogPath('https://deeprealm1.blogspot.com/2026/08/blog-post_28.html?x=1#y'), '/2026/08/blog-post_28.html');
  assert.equal(blogPath('not a url'), '');
});

test('the feed url asks for one post, in JSON or wrapped for a script tag', () => {
  const json = feedUrl('/2026/08/blog-post_28.html');
  assert.match(json, /alt=json\b/);
  assert.match(json, /max-results=1/);
  assert.match(json, /path=\/2026\/08\/blog-post_28\.html/);
  const jsonp = feedUrl('/2026/08/blog-post_28.html', '__cb1');
  assert.match(jsonp, /alt=json-in-script/);
  assert.match(jsonp, /callback=__cb1/);
});

test('a class sheet keeps its own lines when the html is flattened', () => {
  const html = '<p>Роль: боец</p><p>─────</p><p>HP: 12</p>';
  assert.equal(htmlToText(html), 'Роль: боец\n─────\nHP: 12');
});

test('stripTags collapses whitespace only when asked to', () => {
  assert.equal(stripTags('a\n\nb'), 'a b');
  assert.equal(stripTags('a\n\nb', { collapse: false }), 'a\n\nb');
});

test('an index page yields name, author and address per entry', () => {
  const races = parseIndexEntries(INDEX_HTML);
  assert.equal(races.length, 2);
  assert.deepEqual(races[0], {
    name: 'Разумные цветы', author: '@azemow',
    url: 'https://deeprealm1.blogspot.com/2026/08/blog-post_28.html'
  });
  const classes = parseIndexEntries(CLASS_INDEX_HTML);
  assert.deepEqual(classes.map((c) => c.name), ['Магистр сфер', 'Трикстер']);
  assert.equal(classes[1].author, '@LokalError');
});

test('an entry without a creator line is ignored', () => {
  const html = '1. Расса: <a href="https://x/1.html">Без автора</a><br/>Просто текст';
  assert.equal(parseIndexEntries(html).length, 0);
});

test('a post feed is reduced to title, address and readable text', () => {
  const post = parsePostFeed(feedFor('Трикстер', '<p>Роль: трикстер</p><p>HP: 10</p>'));
  assert.equal(post.title, 'Трикстер');
  assert.equal(post.url, 'https://deeprealm1.blogspot.com/2026/09/x.html');
  assert.equal(post.text, 'Роль: трикстер\nHP: 10');
  assert.equal(parsePostFeed({ feed: {} }), null);
});

test('the live list is merged over the snapshot without duplicates', () => {
  const live = [{ name: 'Трикстер', author: '@a', url: 'u1' }, { name: 'Новый класс', author: '@b', url: 'u2' }];
  const snapshot = [{ name: 'трикстер', author: '@a', url: 'u1' }, { name: 'Старый класс', author: '@c', url: 'u3' }];
  const merged = mergeEntries(live, snapshot);
  assert.deepEqual(merged.map((e) => e.name), ['Трикстер', 'Новый класс', 'Старый класс']);
});

test('readIndex reads the entries through the injected loader', async () => {
  const seen = [];
  const loadJson = async (path) => { seen.push(path); return feedFor('Рассы игроков', INDEX_HTML); };
  const result = await readIndex({ indexUrl: 'https://deeprealm1.blogspot.com/2026/08/index.html', loadJson });
  assert.equal(result.live, true);
  assert.deepEqual(result.entries.map((e) => e.name), ['Разумные цветы', 'разумный слайм']);
  assert.deepEqual(seen, ['/2026/08/index.html']);
});

test('readIndex reports a dead blog instead of throwing', async () => {
  const loadJson = async () => { throw new Error('offline'); };
  const result = await readIndex({ indexUrl: 'https://deeprealm1.blogspot.com/2026/08/index.html', loadJson });
  assert.equal(result.live, false);
  assert.deepEqual(result.entries, []);
});

test('readPost returns the post, and fills a missing link from the asked address', async () => {
  const loadJson = async () => ({ feed: { entry: [{ title: { $t: 'Трикстер' }, content: { $t: '<p>HP: 10</p>' } }] } });
  const post = await readPost({ url: 'https://deeprealm1.blogspot.com/2026/09/blog-post_09.html', loadJson });
  assert.equal(post.title, 'Трикстер');
  assert.equal(post.text, 'HP: 10');
  assert.equal(post.url, 'https://deeprealm1.blogspot.com/2026/09/blog-post_09.html');
});

test('the JSONP loader is unavailable without a document', () => {
  assert.equal(createJsonpLoader({ doc: null, win: null }), null);
});
