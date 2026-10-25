import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePlayerEntries } from '../blog-sync.js';
import { buildKnowledgeContext, buildStaffContext, isLLMConfigured, app, staffTurn, stripMarkdown, matchActivityFaq, finaleText, isEndCommand, approvedWithSheet } from '../server.js';
import { buildDocs, retrieve, localGuide, guideReference, localInterview, localStaff, setEngineArticles } from '../ai-engine.js';
import { getKnowledge } from '../chat-core.js';

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

test('the built-in engine retrieves the right document for a real question', () => {
  const docs = buildDocs(getKnowledge());
  const hits = retrieve('Расскажи про класс Воин', docs, 2);
  assert.ok(hits.length, 'the class question must match something');
  assert.match(hits[0].doc.title, /Воин/);
});

test('the built-in engine answers a class question with its mechanics', () => {
  const reply = localGuide({ messages: [{ role: 'user', content: 'Что за класс Маг?' }], lang: 'ru' });
  assert.match(reply, /Маг/);
  assert.match(reply, /Мана/);
  assert.match(reply, /Истощение/);
});

test('the built-in engine admits an unknown question instead of inventing one', () => {
  const reply = localGuide({ messages: [{ role: 'user', content: 'zzz qqq vvv' }], lang: 'ru' });
  assert.match(reply, /нет ответа/);
});

test('the built-in engine answers about rules and lore', () => {
  const rules = localGuide({ messages: [{ role: 'user', content: 'Какие наказания за спам?' }], lang: 'ru' });
  assert.match(rules, /Спам|спам|мут|варн/i);
  const lore = localGuide({ messages: [{ role: 'user', content: 'Что такое Подземелье?' }], lang: 'ru' });
  assert.match(lore, /Подземелье/);
});

test('the guide answers about a class specializations instead of the class itself', () => {
  // The complaint: "я его просил рассказать о специализациях мага, в итоге он
  // выдавал только краткое описание самого мага". The plural "специализациях" used
  // to stem differently from the stored "специализации", so the question fell back to
  // the class overview.
  const reply = localGuide({ messages: [{ role: 'user', content: 'Расскажи о специализациях мага' }], lang: 'ru' });
  assert.match(reply, /Элементалист/);
  assert.match(reply, /Арканный маг/);
  assert.match(reply, /Хроник|Боевой маг/);
  assert.doesNotMatch(reply, /Истощение/, 'the class overview is not the answer');
});

test('the guide prints the full character sheet when asked for the template', () => {
  // The owner: "я буду тебя просить что бы ты засунул полную анкету, а не сократил её".
  const reply = localGuide({ messages: [{ role: 'user', content: 'Покажи шаблон анкеты персонажа' }], lang: 'ru' });
  for (const field of ['Имя:', 'Прозвище:', 'Рост / вес:', 'Ориентация:', 'Возраст:', 'Внешность:', 'Стартовое снаряжение:']) {
    assert.match(reply, new RegExp(field.replace(/[/:]/g, (m) => `\\${m}`)), `field ${field}`);
  }
  assert.match(reply, /Физические характеристики/);
  assert.match(reply, /Сила: 0–10/);
  assert.match(reply, /Здоровье: 0–10/);
  assert.match(reply, /Интеллектуальные способности/);
  assert.match(reply, /Хитрость: 0–10/);
  assert.match(reply, /Эмпатия: 0–10/);
});

test('a class requested for an unnamed race asks which race, and a named one is built', () => {
  // The question the owner passed on: "сможет ли ии сделать класс для расы игрока".
  // No race is named, so the engine must ask rather than invent a free-floating class.
  for (const q of ['Можешь сделать класс для моей расы?', 'может ли ии сделать класс для расы игрока', 'Сделай класс под расу']) {
    const reply = localInterview({ messages: [{ role: 'user', content: q }], lang: 'ru', application: {} });
    assert.match(reply, /назови расу/, `asks for the race: ${q}`);
    assert.doesNotMatch(reply, /^Готово/, `does not invent a class: ${q}`);
  }
  // When the race is named, the class is tied to it.
  const named = localInterview({ messages: [{ role: 'user', content: 'Сделай класс для расы «Пепельники»' }], lang: 'ru', application: {} });
  assert.match(named, /Готово/);
  assert.match(named, /Пепельники/);
});

test('the guide honours a request to answer in a few words', () => {
  // The owner: "А можно ты просто расскажешь в двух словах?" — and the Guide
  // re-printed the whole branch description, which read as if it had not listened.
  const history = [
    { role: 'user', content: 'Расскажи про направление Регистратор' },
    { role: 'assistant', content: 'Направление: Регистратор...' },
    { role: 'user', content: 'А можно ты просто расскажешь в двух словах?' }
  ];
  const full = localGuide({ messages: [history[0]], lang: 'ru' });
  const brief = localGuide({ messages: history, lang: 'ru' });
  assert.match(brief, /Регистратор/);
  assert.ok(brief.length < full.length, 'the brief is shorter than the full answer');
  assert.doesNotMatch(brief, /Главный:/, 'the degrees are not listed again');
  // The topic comes from the previous turn, so the gist is about the branch, not
  // whichever document the phrase "в двух словах" happens to match.
  const briefClass = localGuide({
    messages: [
      { role: 'user', content: 'Что за класс Маг?' },
      { role: 'assistant', content: '...' },
      { role: 'user', content: 'А покороче можно?' }
    ], lang: 'ru'
  });
  assert.match(briefClass, /Маг/);
  assert.ok(briefClass.length < 400, 'a short gist, not the whole entry');
});

test('the guide gives the essence of each specialization in a few words', () => {
  // The owner: "можно в двух словах рассказать что это за специализации?" — and the
  // answer re-listed only the names, with a raw link. It must say what each does.
  const reply = localGuide({
    messages: [
      { role: 'user', content: 'Расскажи про специализации Мага' },
      { role: 'assistant', content: '...' },
      { role: 'user', content: 'Так а можно в двух словах рассказать что это за специализации?' }
    ], lang: 'ru'
  });
  assert.match(reply, /Элементалист/);
  assert.match(reply, /Арканный маг/);
  assert.match(reply, /Хронист/);
  // Each direction carries a one-line meaning, not just its name.
  assert.match(reply, /повелитель стихий/i);
  assert.match(reply, /контрол/i);
  assert.match(reply, /ближнем бою/i);
  assert.doesNotMatch(reply, /https?:\/\//, 'no raw links in the brief');
});

test('a few words about every class specialization works the same way', () => {
  const expectations = {
    Воин: /машина разрушения/i,
    Лучник: /шквал стрел/i,
    Некромант: /армией мёртвых/i,
    Чернокнижник: /демонов-помощников/i
  };
  for (const [cls, re] of Object.entries(expectations)) {
    const reply = localGuide({ messages: [{ role: 'user', content: `в двух словах про специализации ${cls}` }], lang: 'ru' });
    assert.match(reply, re, `${cls} specializations carry their essence`);
    assert.ok(reply.length < 500, `${cls} brief stays short`);
  }
});

test('a few words works for base classes, base races and player entities', () => {
  const klass = localGuide({ messages: [{ role: 'user', content: 'в двух словах про класс Маг' }], lang: 'ru' });
  assert.match(klass, /Маг — /);
  assert.ok(klass.length < 200, 'a base class gets one line');

  const race = localGuide({ messages: [{ role: 'user', content: 'в двух словах про расу Эльф' }], lang: 'ru' });
  assert.match(race, /Эльф/);
  assert.match(race, /лес/i);
  assert.ok(race.length < 300, 'a base race gets one line');

  // The player lists are already compact, so the brief returns them as-is.
  const players = localGuide({ messages: [{ role: 'user', content: 'в двух словах про классы игроков' }], lang: 'ru' });
  assert.match(players, /Трикстер/);
});

test('breaks a player race or class blog post down to its own opening lines', () => {
  setEngineArticles([
    { slug: 'race-Разумные цветы', title: 'Разумные цветы', kind: 'race', text: 'Название народа: разумные цветы\nВнешность: выглядит как цветок с обширным корнем.\nБоевые особенности: покрывает тело шипами.' },
    { slug: 'class-Трикстер', title: 'Трикстер', kind: 'class', text: 'Название класса: Трикстер\nКраткое описание: класс сильный в иллюзорной магии.\nКонцепция: контроль-поддержка' }
  ]);
  try {
    const race = localGuide({ messages: [{ role: 'user', content: 'в двух словах про расу игроков Разумные цветы' }], lang: 'ru' });
    assert.match(race, /Разумные цветы/);
    assert.match(race, /цветок/i);
    assert.doesNotMatch(race, /Название народа/, 'the name line is not repeated');

    const klass = localGuide({ messages: [{ role: 'user', content: 'в двух словах про класс игроков Трикстер' }], lang: 'ru' });
    assert.match(klass, /Трикстер/);
    assert.match(klass, /иллюзорной магии/i);
  } finally {
    setEngineArticles([]);
  }
});

test('the guide answers "как выглядит эльф" with the appearance, not the relations', () => {
  // The owner: "я спрашиваю как выглядит эльф ... мне отвечает Раса ЭЛЬФ: К Людям:
  // Снисходительность ..." — the relations document was winning on the race name.
  const reply = localGuide({ messages: [{ role: 'user', content: 'как выглядит эльф' }], lang: 'ru' });
  assert.match(reply, /Внешность:/);
  assert.match(reply, /зеленоватым|серебристым|длинными конечностями/i);
  assert.doesNotMatch(reply, /^Раса ЭЛЬФ:/m);
  assert.doesNotMatch(reply, /К Людям/, 'the relations are not the answer');
});

test('"а как выглядит он?" borrows the race from the previous turn', () => {
  const reply = localGuide({
    messages: [
      { role: 'user', content: 'как выглядит эльф' },
      { role: 'assistant', content: '...' },
      { role: 'user', content: 'а как выглядит он?' }
    ], lang: 'ru'
  });
  assert.match(reply, /Внешность:/);
  assert.match(reply, /Эльф/i);
  assert.doesNotMatch(reply, /К Людям/);
});

test('"способности первого уровня" returns the level abilities, not the level pass', () => {
  // The owner: "я спрашиваю способности первого уровня — мне отвечает Пасс уровней".
  const reply = localGuide({
    messages: [
      { role: 'user', content: 'класс воин' },
      { role: 'assistant', content: '...' },
      { role: 'user', content: 'способности первого уровня' }
    ], lang: 'ru'
  });
  assert.match(reply, /Удар оружием/);
  assert.match(reply, /1 уровень/);
  assert.doesNotMatch(reply, /Пасс уровней/);
  assert.doesNotMatch(reply, /серебряных монет/);
});

test('a specialization answers on its own with its essence and abilities', () => {
  const reply = localGuide({ messages: [{ role: 'user', content: 'расскажи про специализацию Элементалист' }], lang: 'ru' });
  assert.match(reply, /повелитель стихий/i);
  assert.match(reply, /16 уровень/);
  assert.match(reply, /Буря стихий/);
});

test('a short field follow-up answers with that field only', () => {
  const weaknesses = localGuide({
    messages: [
      { role: 'user', content: 'как выглядит эльф' },
      { role: 'assistant', content: '...' },
      { role: 'user', content: 'а уязвимости?' }
    ], lang: 'ru'
  });
  assert.match(weaknesses, /Уязвимости и слабые стороны/);
  assert.doesNotMatch(weaknesses, /Внешность:/, 'only the asked field is shown');

  const abilities = localGuide({
    messages: [
      { role: 'user', content: 'класс воин' },
      { role: 'assistant', content: '...' },
      { role: 'user', content: 'а способности?' }
    ], lang: 'ru'
  });
  assert.match(abilities, /1 уровень/);
  assert.match(abilities, /Удар оружием/);
  assert.doesNotMatch(abilities, /Ресурс: Выносливость/, 'not the class overview again');
});

test('the terse "Способности 14" is read as level 14', () => {
  const reply = localGuide({
    messages: [
      { role: 'user', content: 'класс воин' },
      { role: 'assistant', content: '...' },
      { role: 'user', content: 'Способности 14' }
    ], lang: 'ru'
  });
  assert.match(reply, /14 уровень/);
  assert.match(reply, /Удар бога/);
  assert.doesNotMatch(reply, /1 уровень/);
  assert.doesNotMatch(reply, /Пасс уровней/);
});

test('two classes with levels in one question are both answered', () => {
  // The owner: "скажи мне способности 15 уровня мага и 10 некроманта" — only the
  // last pair was answered before.
  const reply = localGuide({
    messages: [{ role: 'user', content: 'Хорошо. Теперь скажи мне способности 15 уровня мага и 10 некроманта' }],
    lang: 'ru'
  });
  assert.match(reply, /Способности Маг — 15 уровень/);
  assert.match(reply, /Божественный гнев/);
  assert.match(reply, /Способности Некромант — 10 уровень/);
  assert.match(reply, /Повелитель смерти/);
});

test('three classes with levels in one question are all answered', () => {
  const reply = localGuide({ messages: [{ role: 'user', content: 'способности 5 воина, 7 лучника и 9 мага' }], lang: 'ru' });
  assert.match(reply, /Способности Воин — 5 уровень/);
  assert.match(reply, /Способности Лучник — 7 уровень/);
  assert.match(reply, /Способности Маг — 9 уровень/);
});

test('the model reference carries the appearance text for a looks question', () => {
  const reference = guideReference({ messages: [{ role: 'user', content: 'как выглядит эльф' }], lang: 'ru' });
  assert.match(reference, /Внешность:/);
  assert.match(reference, /Эльф/i);
  assert.doesNotMatch(reference, /К Людям/);
});

test('the built-in interviewer accepts a filled sheet for hand-off', () => {
  const draft = { Имя: 'Лира', Раса: 'Эльф', Класс: 'Маг' };
  const reply = localInterview({ messages: [{ role: 'user', content: 'проверь' }], lang: 'ru', application: draft });
  assert.match(reply, /передаю её владельцу/);
});

test('the built-in interviewer refuses to accept an empty sheet', () => {
  const reply = localInterview({ messages: [{ role: 'user', content: 'проверь' }], lang: 'ru', application: {} });
  assert.doesNotMatch(reply, /передаю её владельцу/);
  assert.match(reply, /не заполнена/);
});

test('the built-in staff interviewer keeps the branch question order', () => {
  const reply = localStaff({ messages: [{ role: 'user', content: 'Хочу в модераторы' }], lang: 'ru', application: {} });
  assert.match(reply, /активить/);
});

// The built-in staff interviewer answers a clarifying question, then asks the same
// scripted question again - the candidate must not lose their step. The interview
// still ends, because the next real answer moves the walk forward.
test('the built-in staff interviewer answers a clarifying question and moves on', () => {
  const history = [
    { role: 'user', content: 'Хочу в пиарщики' },
    { role: 'assistant', content: 'Привлечь хотя бы 5–10 новых людей своими постами — сможешь?' },
    { role: 'user', content: 'а как часто надо приводить людей?' }
  ];
  const reply = localStaff({ messages: history, lang: 'ru', application: {} });
  assert.match(reply, /1–2/, 'the stored norm is quoted');
  assert.match(reply, /5–10/, 'the question comes back so no step is lost');

  // A real answer now advances the walk instead of repeating the question.
  history.push({ role: 'assistant', content: reply }, { role: 'user', content: 'Да, смогу' });
  const next = localStaff({ messages: history, lang: 'ru', application: {} });
  assert.match(next, /соцсет/i, 'the next question is asked');
  assert.doesNotMatch(next, /5–10/, 'the answered question is behind us');
});

test('staff context lists every branch with its questions', () => {
  const ctx = buildStaffContext();
  for (const role of ['Зам владельца', 'Пиарщик', 'Модератор', 'Разработчик', 'Гейм-мастер', 'Регистратор', 'Ивентолог']) {
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

  // Answer the remaining scripted questions by their own text and the interview
  // ends: the questions are fixed, so there is no way to run past the limit.
  for (let i = second.asked; i < second.total; i++) {
    const turn = staffTurn(history);
    history.push({ role: 'assistant', content: turn.question }, { role: 'user', content: 'готов' });
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

// The built-in engine needs no key, so the AI endpoints must answer even when no
// model key is set. These three tests used to assert a 503; they now assert the
// opposite, because a missing or expired key must never take the chats down.

test('staff endpoint answers from the built-in engine without a key', async () => {
  const server = app.listen(0);
  const port = server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/api/staff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'хочу в модеры' }] })
  });
  server.close();
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.match(data.reply, /активить/);
  assert.equal(data.source, 'local');
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

test('guide endpoint answers from the built-in engine without a key', async () => {
  const server = app.listen(0);
  const port = server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/api/guide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Расскажи про класс Воин' }] })
  });
  server.close();
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.match(data.reply, /Воин/);
  assert.equal(data.source, 'local');
});

test('interview endpoint answers from the built-in engine without a key', async () => {
  const server = app.listen(0);
  const port = server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/api/interview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'привет' }] })
  });
  server.close();
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.match(data.reply, /Регистратор/);
});

test('status endpoint reports configuration state', async () => {
  const server = app.listen(0);
  const port = server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/api/status`);
  server.close();
  const data = await res.json();
  assert.equal(data.configured, true, 'the built-in engine is always available');
  assert.equal(data.builtin, true);
  assert.ok(['model', 'live', 'keyless', 'builtin'].includes(data.mode), 'no key set, so the built-in engine or its live upgrade answers');
  assert.equal(typeof data.telegram, 'boolean', 'the page is told whether owner notifications are on');
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

// A candidate who asks a clarifying question instead of answering gets the fact,
// then the same question back. The interview must not end just because they were
// curious - but it must not stall either, which is why the next answer moves on.
test('a clarifying question does not advance the interview', () => {
  const history = [
    { role: 'user', content: 'Хочу в пиарщики' },
    { role: 'assistant', content: 'Привлечь хотя бы 5–10 новых людей своими постами — сможешь?' },
    { role: 'user', content: 'а как часто надо приводить людей?' }
  ];
  const turn = staffTurn(history);
  assert.equal(turn.role.key, 'pr');
  assert.equal(turn.askingQuestion, true);
  const reply = localStaff({ messages: history, lang: 'ru', application: {} });
  assert.match(reply, /1–2/, 'the stored norm is quoted');
  assert.match(reply, /5–10/, 'the same question comes back');

  // Once the candidate actually answers, the interview moves to the next question.
  history.push({ role: 'assistant', content: reply }, { role: 'user', content: 'Да, смогу' });
  const next = staffTurn(history);
  assert.equal(next.asked, 1);
  assert.equal(next.askingQuestion, false);
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

test('the end command is recognised in both languages', () => {
  for (const word of ['конец', 'Конец!', 'закончили', 'итог', 'end', 'Finish', 'done', "that's all"]) {
    assert.ok(isEndCommand(word), `"${word}" must end the dialogue`);
  }
  for (const other of ['', 'конечно', 'а конец?', 'расскажи про конец света', 'finish the story']) {
    assert.equal(isEndCommand(other), false, `"${other}" must not end the dialogue`);
  }
});

test('each assistant ends with its own hand-off wording', () => {
  const interview = finaleText('interview', 'ru', { approved: true });
  assert.match(interview, /Анкета уже у владельца/);
  assert.doesNotMatch(interview, /ОДОБРЕНО/, 'the site accepts the sheet, it does not judge it');
  assert.match(interview, /@Omega_Gribcha/);
  assert.match(interview, /ты принят/, 'an accepted sheet still routes custom races through the owner');

  const staff = finaleText('staff', 'ru', { approved: true });
  assert.match(staff, /Вот юз владельца/);
  assert.match(staff, /Напиши ему, что я тебя проверил/);
  assert.match(staff, /РЕКОМЕНДОВАН/);

  const guide = finaleText('guide', 'ru');
  assert.match(guide, /t\.me\/Deeprealm5/);
});

test('ending early gives the hand-off but never claims approval', () => {
  const interview = finaleText('interview', 'ru');
  assert.doesNotMatch(interview, /ОДОБРЕНО/, 'a cut-short check must not be called approved');
  assert.match(interview, /Анкета уже у владельца/, 'the sheet destination is still useful');

  const staff = finaleText('staff', 'ru');
  assert.doesNotMatch(staff, /РЕКОМЕНДОВАН/, 'a cut-short interview must not be called recommended');
  assert.match(staff, /Вот юз владельца/, 'the owner is still handed over');
});

test('approval is only accepted together with a filled-in sheet', () => {
  const sheet = [{ role: 'user', content: 'Имя: Лира, раса: Эльф, класс: Маг, характер: спокойная.' }];
  assert.equal(approvedWithSheet('ОДОБРЕНО ✅', sheet), true);
  assert.equal(approvedWithSheet('Я официально одобряю эту анкету.', sheet), true, 'the model paraphrases its verdict');
  assert.equal(approvedWithSheet('ОДОБРЕНО ✅', []), false, 'a bare approval on an empty sheet is ignored');
  assert.equal(approvedWithSheet('Имя: Лира, раса: Эльф', sheet), false, 'a sheet without approval is not final');
});

test('a sheet is recognised from the dialogue itself when the draft is empty', () => {
  const race = [{ role: 'user', content: 'Название: Стеклянные. Самоназвание: Звонари. Уязвимость: хрупкость.' }];
  assert.equal(approvedWithSheet('официально одобряю', race), true, 'a race sheet needs no draft JSON');
  assert.equal(approvedWithSheet('официально одобряю', [{ role: 'user', content: 'привет' }]), false);
});

test('finishing a staff interview returns the hand-off without calling the model', async () => {
  const server = app.listen(0);
  const port = server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/api/staff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Конец' }], application: { branch: 'moderator' } })
  });
  server.close();
  // No API key in tests, so a finale reply proves the end command is handled
  // before the model lookup, which would otherwise answer 503.
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.finale, true);
  assert.match(data.reply, /Напиши ему, что я тебя проверил/);
});


test('the static-site relay refuses a request without the key', async () => {
  const previous = process.env.RELAY_KEY;
  process.env.RELAY_KEY = 'secret-key';
  const server = app.listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'visit', session: 's', page: 'home' })
    });
    assert.equal(res.status, 401, 'a wrong key never reaches the bot');
  } finally {
    server.close();
    if (previous === undefined) delete process.env.RELAY_KEY; else process.env.RELAY_KEY = previous;
  }
});

test('the static-site relay is closed when no key is configured', async () => {
  const previous = process.env.RELAY_KEY;
  delete process.env.RELAY_KEY;
  const server = app.listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Relay-Key': 'anything' },
      body: JSON.stringify({ type: 'visit', session: 's' })
    });
    assert.equal(res.status, 401, 'an unconfigured relay must not be an open relay');
  } finally {
    server.close();
    if (previous === undefined) delete process.env.RELAY_KEY; else process.env.RELAY_KEY = previous;
  }
});

test('the static-site relay accepts the right key and answers the preflight', async () => {
  const previous = process.env.RELAY_KEY;
  process.env.RELAY_KEY = 'secret-key';
  const server = app.listen(0);
  const port = server.address().port;
  try {
    const preflight = await fetch(`http://127.0.0.1:${port}/api/notify`, { method: 'OPTIONS' });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), '*', 'the Pages page is on another origin');

    const res = await fetch(`http://127.0.0.1:${port}/api/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Relay-Key': 'secret-key' },
      body: JSON.stringify({ type: 'visit', session: 's', page: 'home' })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    // Telegram is not configured in tests, so the relay reports it rather than failing.
    assert.equal(typeof data.telegram, 'boolean');
  } finally {
    server.close();
    if (previous === undefined) delete process.env.RELAY_KEY; else process.env.RELAY_KEY = previous;
  }
});
