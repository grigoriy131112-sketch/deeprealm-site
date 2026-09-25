import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePlayerEntries } from '../blog-sync.js';
import { buildKnowledgeContext, buildStaffContext, isLLMConfigured, app, staffTurn, stripMarkdown, matchActivityFaq } from '../server.js';

// Real markup fragments copied from the Deeprealm blog index pages.
const CLASSES_HTML = `<p>Собственно вот сами классы:</p><p>1. Класс:&nbsp;<a href="https://deeprealm1.blogspot.com/2026/09/blog-post.html">Магистр сфер</a> <br />Создатель: @ghg23456</p><p>2. Класс: <a href="https://deeprealm1.blogspot.com/2026/09/blog-post_09.html">Трикстер</a><br />Создатель: @LokalError</p>`;
const RACES_HTML = `<p>Собственно вот сами рассы:</p><p>1. Расса: <a href="https://deeprealm1.blogspot.com/2026/08/blog-post_28.html">Разумные цветы </a><br />Создатель: @azemow</p><p>2. Расс: <a href="https://deeprealm1.blogspot.com/2026/08/blog-post_30.html">разумный слайм</a><br />Создатель: @neri_moon</p>`;

test('parses player-made classes from blog markup', () => {
  const entries = parsePlayerEntries(CLASSES_HTML);
  assert.deepEqual(entries, [
    { name: 'Магистр сфер', author: '@ghg23456', url: 'https://deeprealm1.blogspot.com/2026/09/blog-post.html' },
    { name: 'Трикстер', author: '@LokalError', url: 'https://deeprealm1.blogspot.com/2026/09/blog-post_09.html' }
  ]);
});

test('parses player-made races from blog markup', () => {
  const entries = parsePlayerEntries(RACES_HTML);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].name, 'Разумные цветы');
  assert.equal(entries[1].author, '@neri_moon');
});

test('ignores markup without a creator line', () => {
  assert.deepEqual(parsePlayerEntries('<p>Класс: <a href="#">X</a></p>'), []);
});

test('stripMarkdown removes bold, headings, bullets and code', () => {
  const reply = '### Воин\n\n**Основной ресурс:** Выносливость\n\n* Рыцарь-защитник\n* Берсерк\n\n1. первый\n`code`';
  const clean = stripMarkdown(reply);
  assert.ok(!clean.includes('*'), 'no asterisks should remain');
  assert.ok(!clean.includes('#'), 'no hashes should remain');
  assert.ok(!clean.includes('`'), 'no backticks should remain');
  assert.match(clean, /Воин/);
  assert.match(clean, /Основной ресурс: Выносливость/);
  assert.match(clean, /— Рыцарь-защитник/);
  assert.match(clean, /1\) первый/);
});

test('stripMarkdown keeps plain dashes and normal text intact', () => {
  const text = 'Список:\n— Рыцарь-защитник\n— Берсерк\n3–5 способностей.';
  assert.equal(stripMarkdown(text), text);
});

test('stripMarkdown preserves links', () => {
  const clean = stripMarkdown('Чат: [Deeprealm](https://t.me/Deeprealm5)');
  assert.match(clean, /\[Deeprealm\]\(https:\/\/t\.me\/Deeprealm5\)/);
});

test('knowledge context includes chat, rules, lore and templates', () => {
  const ctx = buildKnowledgeContext('ru');
  assert.match(ctx, /Deeprealm/);
  assert.match(ctx, /t\.me\/Deeprealm5/);
  assert.match(ctx, /@Omega_Gribcha/);
  assert.match(ctx, /ПРАВИЛА/);
  assert.match(ctx, /Воин/);
  assert.match(ctx, /Подземелье/);
  assert.match(ctx, /ШАБЛОН АНКЕТЫ ПЕРСОНАЖА/);
});

test('knowledge context is produced for both languages', () => {
  assert.ok(buildKnowledgeContext('ru').length > 1000);
  assert.ok(buildKnowledgeContext('en').length > 1000);
});

test('LLM is reported as unconfigured when no key is set', () => {
  assert.equal(isLLMConfigured(), false);
});

test('staff context lists every branch with its questions', () => {
  const ctx = buildStaffContext();
  for (const role of ['Зам владельца', 'Пиарщик', 'Модератор', 'Разработчик', 'Гейм-мастер', 'Анкетолог', 'Ивентолог']) {
    assert.match(ctx, new RegExp(role));
  }
  assert.match(ctx, /Сколько готов активить/);
  assert.match(ctx, /писать посты/);
  assert.match(ctx, /Практикант/);
});

test('knowledge context includes the administration section', () => {
  const ctx = buildKnowledgeContext('ru');
  assert.match(ctx, /АДМИНИСТРАЦИЯ/);
  assert.match(ctx, /СТУПЕНИ РОСТА/);
});

test('staff interview walks the branch questions in order', () => {
  const history = [{ role: 'user', content: 'Хочу в модераторы' }];
  const first = staffTurn(history);
  assert.equal(first.role.key, 'moderator');
  assert.equal(first.asked, 0);
  assert.match(first.question, /активить/);

  history.push({ role: 'assistant', content: first.question }, { role: 'user', content: 'часа три в день' });
  const second = staffTurn(history);
  assert.equal(second.asked, 1);
  assert.match(second.question, /конфликт/);

  // Finish the branch and the interviewer switches to the summary instruction.
  const total = first.total;
  for (let i = history.filter((m) => m.role === 'user').length; i < total + 1; i++) {
    history.push({ role: 'assistant', content: 'ок' }, { role: 'user', content: 'готов' });
  }
  const last = staffTurn(history);
  assert.equal(last.done, true);
  assert.equal(last.question, '');
});

test('staff interview asks for the branch first and honours a stored branch', () => {
  const start = staffTurn([{ role: 'user', content: 'привет' }]);
  assert.equal(start.role, null);
  assert.match(start.question, /направление/);

  const resumed = staffTurn([{ role: 'user', content: 'привет' }], { branch: 'gm' });
  assert.equal(resumed.role.key, 'gm');
  assert.match(resumed.question, /посты/);
});

test('staff endpoint returns 503 when AI is not configured', async () => {
  const server = app.listen(0);
  const port = server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/api/staff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'хочу в модеры' }] })
  });
  server.close();
  assert.equal(res.status, 503);
  const data = await res.json();
  assert.equal(data.error, 'not_configured');
});

test('knowledge endpoint exposes the administration data', async () => {
  const server = app.listen(0);
  const port = server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/api/knowledge`);
  server.close();
  const data = await res.json();
  assert.ok(Array.isArray(data.administration.roles));
  assert.equal(data.administration.roles.length, 7);
  assert.ok(data.classes.level_pass.tiers.length === 3);
});

test('guide endpoint returns 503 when AI is not configured', async () => {
  const server = app.listen(0);
  const port = server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/api/guide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'привет' }] })
  });
  server.close();
  assert.equal(res.status, 503);
  const data = await res.json();
  assert.equal(data.error, 'not_configured');
});

test('interview endpoint returns 503 when AI is not configured', async () => {
  const server = app.listen(0);
  const port = server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/api/interview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] })
  });
  server.close();
  assert.equal(res.status, 503);
});

test('status endpoint reports configuration state', async () => {
  const server = app.listen(0);
  const port = server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/api/status`);
  server.close();
  const data = await res.json();
  assert.equal(typeof data.configured, 'boolean');
});

test('knowledge context includes the GM plot template', () => {
  const ctx = buildKnowledgeContext('ru');
  assert.match(ctx, /ШАБЛОН ЗАЯВКИ НА СЮЖЕТ ДЛЯ ГМ/);
  assert.match(ctx, /Визитная карточка/);
  assert.match(ctx, /Свобода игроков/);
  assert.match(ctx, /Не пиши сценарий, пиши ситуацию/);
});

test('knowledge endpoint exposes the GM plot template', async () => {
  const server = app.listen(0);
  const port = server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/api/knowledge`);
  server.close();
  const data = await res.json();
  assert.match(data.storyTemplate, /Шаблон заявки на сюжет для ГМ/);
});

test('staff context carries activity norms and candidate FAQ', () => {
  const ctx = buildStaffContext();
  assert.match(ctx, /1–2 новых человека в две недели/);
  assert.match(ctx, /ЧАСТЫЕ ВОПРОСЫ КАНДИДАТОВ/);
  assert.match(ctx, /платят ли за это/);
});

test('a clarifying question does not advance the interview', () => {
  const history = [
    { role: 'user', content: 'Хочу в пиарщики' },
    { role: 'assistant', content: 'Привлечь хотя бы 5–10 новых людей своими постами — сможешь?' },
    { role: 'user', content: 'а как часто надо приводить людей?' }
  ];
  const turn = staffTurn(history);
  assert.equal(turn.role.key, 'pr');
  assert.equal(turn.asked, 0, 'the question must not count as an answer');
  assert.equal(turn.askingQuestion, true);
  assert.match(turn.question, /5–10/);
});

test('answering normally advances the interview', () => {
  const history = [
    { role: 'user', content: 'Хочу в пиарщики' },
    { role: 'assistant', content: 'Привлечь хотя бы 5–10 новых людей своими постами — сможешь?' },
    { role: 'user', content: 'Да, смогу' }
  ];
  const turn = staffTurn(history);
  assert.equal(turn.asked, 1);
  assert.equal(turn.askingQuestion, false);
  assert.match(turn.question, /опыт ведения соцсетей/);
});

test('activity FAQ matches the question by keywords', () => {
  const match = matchActivityFaq('а как часто надо приводить людей?');
  assert.ok(match, 'the frequency question should match');
  assert.match(match.a, /1–2/);
  assert.equal(matchActivityFaq('совсем не по теме текст'), null);
});
