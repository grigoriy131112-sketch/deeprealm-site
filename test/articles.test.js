import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { htmlToText, parseFeed, kindForTitle } from '../articles.js';
import { createArticleStore } from '../article-store.js';
import { detectSheetKind } from '../publish.js';

test('blog HTML becomes readable text with the layout intact', () => {
  const html = '<p>&nbsp;══════</p><p>🗡️ ВОИН</p><p><br /></p><p>&nbsp; Урон: 12 &amp; щит</p>';
  const text = htmlToText(html);
  assert.match(text, /══/);
  assert.match(text, /ВОИН/);
  assert.match(text, /Урон: 12 & щит/, 'entities must be decoded');
  assert.doesNotMatch(text, /<p>/, 'no markup may survive');
});

test('a feed entry is parsed with its kind and link', () => {
  const feed = {
    feed: {
      entry: [{
        title: { $t: 'Воин' },
        content: { $t: '<p>ХП: 120 старт</p>' },
        link: [{ rel: 'alternate', href: 'https://deeprealm1.blogspot.com/2026/08/blog-post_137.html' }]
      }]
    }
  };
  const [article] = parseFeed(feed);
  assert.equal(article.title, 'Воин');
  assert.equal(article.kind, 'class');
  assert.equal(article.slug, 'blog-post_137');
  assert.match(article.text, /ХП: 120/);
});

test('articles are grouped so the site can filter them', () => {
  assert.equal(kindForTitle('Орки'), 'race');
  assert.equal(kindForTitle('Некромант'), 'class');
  assert.equal(kindForTitle('История мира'), 'lore');
  assert.equal(kindForTitle('Нечто новое'), 'other');
});

test('the store lists, reads and updates articles', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dr-art-')), 'articles.json');
  const store = createArticleStore(file);
  store.upsert({ title: 'Воин', kind: 'class', text: 'старое' });
  assert.equal(store.list().length, 1);

  store.upsert({ title: 'Воин', kind: 'class', text: 'новое' });
  assert.equal(store.list().length, 1, 'the same title must not duplicate');
  assert.equal(store.get('воин').text, 'новое');
});

test('a published player race gets its own slug and never overwrites a blog article', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dr-art-')), 'articles.json');
  const store = createArticleStore(file);
  store.upsert({ slug: 'орки', title: 'Орки', kind: 'race', text: 'из блога' });

  const first = store.publish({ title: 'Орки', kind: 'race', text: 'от игрока' });
  assert.notEqual(first.slug, 'орки', 'the blog article must stay untouched');
  assert.equal(store.get('орки').text, 'из блога');

  const second = store.publish({ title: 'Орки', kind: 'race', text: 'второй игрок' });
  assert.notEqual(second.slug, first.slug, 'two players with the same name both keep an article');
  assert.equal(store.list().filter((a) => a.title === 'Орки').length, 3);
});

test('a race sheet is told apart from a class sheet and from a character', () => {
  const race = [
    { role: 'user', content: 'Хочу создать свою расу. Название: Куклы. Самоназвание: Никто.' },
    { role: 'user', content: 'Особые приметы: фарфор, шарниры. Уязвимость: хрупкость. Форма правления: нет.' }
  ];
  const cls = [
    { role: 'user', content: 'Хочу создать свой класс. Роль: танк. Ресурс: Рвение, 50.' },
    { role: 'user', content: 'HP: 120, +15 за уровень. Уровень 1: удар щитом.' }
  ];
  const character = [{ role: 'user', content: 'Имя: Лира, раса: Эльф, класс: Маг, характер: спокойная.' }];

  assert.equal(detectSheetKind(race), 'race');
  assert.equal(detectSheetKind(cls), 'class');
  assert.equal(detectSheetKind(character), null, 'a plain character sheet is not an article');
});
