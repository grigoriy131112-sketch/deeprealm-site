// Publishes the Deeprealm article to Telegraph (telegra.ph).
//
// The article is public content for the game's players, so it lives in the repo
// as data rather than being typed into a dashboard. Telegraph's API needs no bot
// and no login: a one-off account returns an access token, and that token is what
// lets the same article be edited later instead of duplicated. The token is a
// credential, so it is read from TELEGRAPH_TOKEN or a local file and never
// committed.
//
//   node scripts/publish-telegraph.js            # create a fresh article
//   TELEGRAPH_TOKEN=... node scripts/publish-telegraph.js   # reuse an account
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://api.telegra.ph';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tokenFile = path.join(root, '.telegraph-token');
const pageFile = path.join(root, '.telegraph-page');

const knowledge = JSON.parse(fs.readFileSync(path.join(root, 'data', 'knowledge.json'), 'utf8'));
const chat = knowledge.chat;

const site = process.env.SITE_URL || 'https://deeprealm-site.onrender.com';
const owner = chat.owner;
const chatLink = chat.telegram;
const blog = 'https://deeprealm1.blogspot.com';

// Telegraph's node format: every node is { tag, attrs, children }. Text is a
// bare string. Helpers keep the article readable below; a paragraph or list item
// may take a plain string or an array of strings and inline nodes, so bold and
// links mix with text instead of being stringified.
const kids = (text) => (Array.isArray(text) ? text : [text]);
const p = (text) => ({ tag: 'p', children: kids(text) });
const b = (text) => ({ tag: 'b', children: [text] });
const a = (text, href) => ({ tag: 'a', attrs: { href }, children: [text] });
const h3 = (text) => ({ tag: 'h3', children: [text] });
const ul = (items) => ({ tag: 'ul', children: items.map((t) => ({ tag: 'li', children: kids(t) })) });

const content = [
  p(`Deeprealm — это нарративное тёмное фэнтези-РП в Telegram. Здесь игроки создают персонажей, свои расы и классы, а ведущий проводит их через мрак и свет мира после гибели Единого Королевства.`),

  h3('Мир'),
  p(`Давным-давно мир был черновиком жестоких высших существ. Один из них восстал, поглотил силу остальных и стал Спасителем, а из оболочек поверженных тиранов создал Хранителей. Позже маг Серафим Светлый объединил земли в Единое Королевство, но его друг, которого теперь называют Забытый Временем, основал Культ Космоса и ударил по гармонии Королевства. Так началась Великая Битва, а затем — раскол и Грохот.`),
  p(`В настоящем Культ распался, а Печать, которой Серафим запечатал Подземелье, ослабла. Забытый Временем на свободе, и куда он ушёл — не знает никто.`),

  h3('Земли'),
  ul([
    [b('Элдария'), ' — обитаемый континент Ориона: мягкое лето, прохладные зимы, здесь же находится Подземелье.'],
    [b('Кхарад'), ' — не исследован: никто не смог его освоить.'],
    [b("Вел'Мора"), ' — не исследован: моря неспокойны, корабли не возвращаются.'],
  ]),
  p([b('Кализей'), ' — магический пузырь с бескрайними полями, вечным полуденным солнцем и древними арками. Здесь живёт Наставник, бывший культист, который учит новичков основам мира и отправляет их через арки в Элдарию.']),
  p([b('Подземелье'), ' — бывшая тюрьма культистов Космоса. Их магия пропитала её, и она ожила: каждый босс — бывший культист, сросшийся со своей стихией. Зоны — Волшебный Сад, Кузница Коваля, Тёмный Лес и Сердце Глубин; в самом конце — Сердце Печати.']),

  h3('Как вступить'),
  p(`Всё начинается на сайте. Достаточно указать свой ник в Telegram, а дальше ИИ-регистратор поможет собрать анкету.`),
  ul([
    `Расскажите о персонаже свободно — имя, раса, класс, характер, сильные и слабые стороны.`,
    `Команда «добавь в анкету» сохраняет детали в черновик.`,
    `Можно придумать расу или класс самому, а можно попросить регистратора: скажите «придумай мне расу сам».`,
    `Когда анкета готова — скажите «проверь». Сайт не судит анкету: он принимает её и передаёт владельцу, который выносит решение.`,
  ]),
  p([`Сайт: `, a(site, site)]),
  p([`Чат в Telegram: `, a(chatLink, chatLink)]),

  h3('Расы'),
  p(`В мире шесть основных рас: ${knowledge.races.list.join(', ')}.`),
  p(`Отношения между расами, их особенности и правила создания своей расы описаны на сайте. Если хотите собственную расу — регистратор поможет оформить её по шаблону, а владелец опубликует в блоге.`),

  h3('Классы'),
  p(`Пять базовых классов, у каждого свой ресурс и правило истощения:`),
  ul(
    Object.entries(knowledge.classes.base_classes).map(([name, c]) =>
      [b(name), ` — ресурс «${c.resource}», старт: ${c.start}. Базовая атака: ${c.basic_attack}. Способности: ${c.abilities}.`]
    )
  ),
  p(`На 16 уровне класс получает специализации, а способности открываются по мере роста. Свой класс тоже можно предложить — с правилами баланса и перезарядкой способностей.`),

  h3('Пасс уровней'),
  p(`Отдельная система наград за уровни 1–15: ступени Новичок, Продвинутый и Профи. За активную игру и участие в жизни чата выдаются награды и бонусы.`),

  h3('Администрация'),
  p(`Команда проекта — это направления: зам владельца, пиарщик, модератор, разработчик, гейм-мастер, регистратор и ивентолог. В каждом есть ступени роста, а вступить можно через отдельное собеседование на сайте: регистратор по кандидатам задаёт несколько вопросов по выбранному направлению.`),

  h3('Ссылки'),
  ul([
    a('Сайт Deeprealm', site),
    a('Чат в Telegram', chatLink),
    a('Блог с расами, классами и новостями', blog),
    a(`Владелец ${owner}`, `https://t.me/${owner.replace('@', '')}`),
  ]),
  p(`Если остались вопросы — заходите на сайт, спросите ИИ-Проводника или напишите владельцу.`),
  { tag: 'p', children: [{ tag: 'em', children: ['Статья подготовлена ИИ-агентом (OpenHands) от имени владельца Deeprealm.'] }] },
];

async function telegraph(method, params) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    body.set(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
  const res = await fetch(`${API}/${method}`, { method: 'POST', body });
  const data = await res.json();
  if (!data.ok) throw new Error(`${method}: ${data.error}`);
  return data.result;
}

async function main() {
  let token = process.env.TELEGRAPH_TOKEN || '';
  if (!token && fs.existsSync(tokenFile)) token = fs.readFileSync(tokenFile, 'utf8').trim();
  if (!token) {
    const account = await telegraph('createAccount', {
      short_name: 'Deeprealm',
      author_name: 'Deeprealm',
      author_url: chatLink
    });
    token = account.access_token;
    fs.writeFileSync(tokenFile, token, { mode: 0o600 });
    console.log(`created a Telegraph account (token saved to ${path.relative(root, tokenFile)})`);
  }

  let path_ = process.env.TELEGRAPH_PATH || '';
  if (!path_ && fs.existsSync(pageFile)) path_ = fs.readFileSync(pageFile, 'utf8').trim();
  const fields = {
    access_token: token,
    title: 'Deeprealm — тёмное фэнтези-РП в Telegram',
    author_name: 'Deeprealm',
    author_url: chatLink,
    content,
    return_content: false
  };

  // Editing the same page keeps one address instead of littering telegra.ph with
  // copies of the article on every run. A fresh page is created only the first time.
  const page = path_
    ? await telegraph('editPage', { ...fields, path: path_ })
    : await telegraph('createPage', fields);
  if (!path_) fs.writeFileSync(pageFile, page.path, { mode: 0o600 });

  console.log(`${path_ ? 'updated' : 'published'}: ${page.url}`);
  return page.url;
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
