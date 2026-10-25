// The site's own AI.
//
// This engine answers the Guide, the character Interviewer and the Staff
// interviewer with no API key and no network at all: it reads the knowledge base
// and the player races/classes read from the blog, retrieves the relevant part
// and phrases a natural answer. A model key is therefore optional - when one is
// present it only upgrades the wording, and when it is missing (or the key expires,
// or the daily quota runs out) the chats keep answering exactly as before.
//
// The file is bundled into the browser too, so static hosting gets the same AI.

import { getKnowledge, staffTurn, matchActivityFaq, finaleText, isEndCommand } from './chat-core.js';
import { generateRace, generateClass, generateClassForRace, seedFrom, renderGenerated, conceptName, RACE_NATURE } from './ai-gen.js';

let engArticles = [];
export function setEngineArticles(list) {
  engArticles = Array.isArray(list) ? list : [];
  docsRef = null;
}

const pick = (lang, ru, en) => (lang === 'en' ? en : ru);

// ---------------------------------------------------------------- text tools

// Function words carry no topic, so they are dropped before matching. Without
// this, "а как у него с магией" would score on "как" alone.
const STOP = new Set([
  'и', 'в', 'во', 'не', 'что', 'он', 'на', 'я', 'с', 'со', 'как', 'а', 'то', 'все', 'она', 'так',
  'его', 'но', 'да', 'ты', 'к', 'у', 'же', 'вы', 'за', 'бы', 'по', 'только', 'ее', 'мне', 'было',
  'вот', 'от', 'меня', 'еще', 'нет', 'о', 'из', 'ему', 'теперь', 'когда', 'даже', 'ну', 'вдруг',
  'ли', 'если', 'уже', 'или', 'ни', 'быть', 'был', 'него', 'до', 'вас', 'нибудь', 'опять', 'уж',
  'вам', 'ведь', 'там', 'потом', 'себя', 'ничего', 'ей', 'может', 'они', 'тут', 'где', 'есть',
  'надо', 'ней', 'для', 'мы', 'тебя', 'их', 'чем', 'была', 'сам', 'чтоб', 'без', 'будто', 'чего',
  'раз', 'тоже', 'себе', 'под', 'будет', 'тогда', 'кто', 'этот', 'того', 'потому', 'этого', 'какой',
  'совсем', 'ним', 'здесь', 'этом', 'один', 'почти', 'мой', 'тем', 'чтобы', 'нее', 'сейчас', 'были',
  'куда', 'зачем', 'всех', 'никогда', 'можно', 'при', 'наконец', 'два', 'об', 'другой', 'хоть',
  'после', 'над', 'больше', 'тот', 'через', 'эти', 'нас', 'про', 'всего', 'них', 'какая', 'какие',
  'какое', 'какую', 'много', 'разве', 'три', 'эту', 'моя', 'впрочем', 'хорошо', 'свою', 'этой',
  'перед', 'иногда', 'лучше', 'чуть', 'том', 'нельзя', 'такой', 'им', 'более', 'всегда', 'конечно',
  'всю', 'между', 'это', 'расскажи', 'скажи', 'подскажи', 'дай', 'хочу', 'нужно',
  'the', 'and', 'for', 'you', 'are', 'but', 'not', 'with', 'can', 'how', 'what', 'who', 'why',
  'when', 'where', 'does', 'did', 'was', 'were', 'this', 'that', 'there', 'have', 'has', 'had',
  'about', 'into', 'from', 'your', 'our', 'their', 'his', 'her', 'its', 'will', 'would', 'should',
  'could', 'tell', 'give', 'some', 'any', 'all', 'one', 'two', 'also', 'just', 'like', 'get'
]);

// A light suffix stripper. Russian inflects heavily ("расы", "расу", "расе"), so
// matching on the stem is what makes retrieval work for real questions.
export function stem(word) {
  const w = String(word || '').toLowerCase().replace(/ё/g, 'е');
  if (w.length <= 3) return w;
  let s = w.replace(/(иями|иях|иям|ями|ами|ов|ев|ей|ой|ый|ий|ая|яя|ое|ее|ые|ие|ах|ях|ам|ям|ом|ем|ую|юю|ии|ия|ию|ью|ть|а|я|о|е|у|ю|ы|и|ь)$/, '');
  // Verbs and verbal nouns split here: "создать" and "создания" must land on the
  // same stem, or a question about creating something misses the rules that
  // describe creating it.
  if (s.length >= 6 && /ни$/.test(s)) s = s.slice(0, -2);
  else if (s.length >= 6) s = s.replace(/[тн]$/, '');
  return s.length >= 3 ? s : w;
}

export function tokens(text) {
  const out = [];
  for (const raw of String(text || '').toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я0-9]+/)) {
    if (raw.length < 3 || STOP.has(raw)) continue;
    out.push(stem(raw));
  }
  return out;
}

const tokenSet = (text) => new Set(tokens(text));

// A question about a whole category ("какие есть классы", "что за расы") should
// return the overview, not one member of it. The overview documents are marked
// with a plural list tag and win when the question itself asks for a list. The
// wording must sit next to a category word: a bare "какие" also opens a comparison
// ("какие у них преимущества"), which is about the entity just discussed, not the
// overview.
const LIST_RE = /\b(какие|список|перечисли|сколько|list)\b[^?.!]{0,20}\b(расы|раса|расс|классы|класс|специализации|направления)\b|\b(расы|расса|расы|классы|список рас|список классов)\b[^?.!]{0,20}\b(есть|существует|перечисли|список)\b|what .* (races|classes)/i;
const isListDoc = (doc) => doc.id === 'classes' || doc.id === 'races';

// ------------------------------------------------------------------- corpus

// Every answerable piece of the site becomes a document: the chat card, each
// rules section, each lore chapter, each race and class, the level pass, the
// administration branches and every article.
export function buildDocs(k) {
  const docs = [];
  const add = (id, title, text, kind, tags, extra) => {
    const body = String(text == null ? '' : text).trim();
    if (body) docs.push(Object.assign({ id, title: String(title || ''), text: body, kind: kind || 'text', tags: tags || [] }, extra || {}));
  };
  k = k || {};

  const chat = k.chat || {};
  add('chat', pick('ru', 'О чате', 'About the chat'), [
    `${chat.name || ''} — ${chat.tagline || ''}`,
    chat.genre ? `Жанр: ${chat.genre}` : '',
    chat.entry ? `Как попасть: ${chat.entry}` : '',
    chat.telegram ? `Ссылка на чат: ${chat.telegram}` : '',
    chat.owner ? `Владелец: ${chat.owner}` : '',
    chat.contact ? `Связь: ${chat.contact}` : ''
  ].filter(Boolean).join('\n'), 'chat', ['чат', 'вступить', 'ссылка', 'владелец', 'контакт', 'join', 'link']);

  for (const [section, items] of Object.entries(k.rules || {})) {
    add(`rule:${section}`, section, (items || []).map((i) => `— ${i}`).join('\n'), 'rules',
      ['правила', 'наказание', 'нарушение', 'rules']);
  }

  for (const [title, value] of Object.entries(k.lore || {})) {
    const text = typeof value === 'string'
      ? value
      : Object.entries(value || {}).map(([n, v]) => `${n}: ${v}`).join('\n');
    add(`lore:${title}`, title, text, 'lore', ['лор', 'мир', 'история', 'lore']);
  }

  const races = k.races || {};
  // The relation keys are upper-case ("ЭЛЬФ") while the briefs are written in the
  // blog's mixed case ("Эльф"), so the two are matched without regard to case.
  const raceBriefFor = (name) => {
    const key = Object.keys(races.briefs || {}).find((b) => b.toLowerCase() === String(name).toLowerCase());
    return { raceBriefName: key || name, raceBrief: key ? races.briefs[key] : '' };
  };
  if (races.list) add('races', pick('ru', 'Расы', 'Races'), pick('ru', `Базовые расы: ${races.list.join(', ')}.`, `Base races: ${races.list.join(', ')}.`), 'races', ['расы', 'список', 'races'], { raceName: null, raceBriefs: races.briefs || {} });
  // The full profile of each base race: appearance, way of life, combat traits,
  // weaknesses. This is what "как выглядит эльф" answers from — the relations
  // document alone (who likes whom) was the wrong answer to a looks question. It is
  // added before the relations so a plain "расскажи про эльфа" gets the profile.
  for (const [name, fields] of Object.entries(races.details || {})) {
    const body = Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('\n');
    add(`race-det:${name}`, pick('ru', `Раса ${name}`, `Race ${name}`), body, 'race',
      ['раса', name, 'внешность', 'внешний вид', 'как выглядит', 'как выглядят', 'описание', 'appearance', 'look'],
      { raceName: name, raceDetailsName: name, raceFields: fields, ...raceBriefFor(name) });
  }
  for (const [name, value] of Object.entries(races.relations || {})) {
    const text = typeof value === 'string' ? value : Object.entries(value || {}).map(([n, v]) => `${n}: ${v}`).join('\n');
    add(`race-rel:${name}`, pick('ru', `Раса ${raceBriefFor(name).raceBriefName}`, `Race ${raceBriefFor(name).raceBriefName}`), text, 'race',
      ['раса', name, 'отношения', 'отношение', 'дружба', 'вражда'], { raceName: name, ...raceBriefFor(name) });
  }
  if (races.race_template_rules) add('race-rules', pick('ru', 'Правила создания расы', 'Race creation rules'), races.race_template_rules.map((r) => `— ${r}`).join('\n'), 'race', ['раса', 'правила', 'баланс']);
  if (races.race_template_fields) add('race-fields', pick('ru', 'Поля анкеты расы', 'Race sheet fields'), races.race_template_fields.map((f) => `— ${f}`).join('\n'), 'race', ['раса', 'шаблон', 'поля']);
  if ((races.player_races || []).length) {
    add('race-players', pick('ru', 'Расы игроков', 'Player races'), races.player_races.map((r) => `${r.name} — ${r.author}${r.url ? ` (${r.url})` : ''}`).join('\n'), 'race', ['расы', 'игроки'], { playerList: true });
  }

  const classes = k.classes || {};
  // An overview document, so "какие есть классы" returns the list rather than one
  // arbitrary class that happens to share the word.
  if (Object.keys(classes.base_classes || {}).length) {
    add('classes', pick('ru', 'Классы', 'Classes'), pick('ru',
      `Базовые классы: ${Object.keys(classes.base_classes).join(', ')}. У каждого есть ресурс, механика истощения и 15 начальных уровней.`,
      `Base classes: ${Object.keys(classes.base_classes).join(', ')}. Each has a resource, an exhaustion mechanic and 15 starting levels.`
    ), 'class', ['классы', 'список', 'classes']);
  }
  for (const [name, d] of Object.entries(classes.base_classes || {})) {
    add(`class:${name}`, pick('ru', `Класс ${name}`, `Class ${name}`), [
      `Класс: ${name}`,
      `Ресурс: ${d.resource}`,
      `Старт: ${d.start}`,
      `Базовая атака: ${d.basic_attack}`,
      `Способности: ${d.abilities}`,
      `Истощение: ${d.exhaustion}`
    ].join('\n'), 'class', ['класс', name, 'class'], { data: d, name, classBrief: d.brief || '' });
    // The per-level ability list, so "способности первого уровня" answers with the
    // abilities themselves instead of falling through to the level pass rewards.
    if (Array.isArray(d.levels) && d.levels.length) {
      add(`class-lv:${name}`, pick('ru', `Способности ${name} по уровням`, `${name} abilities by level`),
        d.levels.map((lv) => `${lv.level} уровень: ${lv.abilities.join('; ')}`).join('\n'),
        'class', ['способности', 'умения', 'навыки', 'уровни', 'уровень', 'level', name],
        { classLevels: d.levels, name });
    }
  }
  const specLinks = (classes.links && classes.links.specializations) || {};
  const specBriefs = classes.specialization_briefs || {};
  const specDetail = classes.specializations_detail || {};
  for (const [name, specs] of Object.entries(classes.specializations || {})) {
    const list = Array.isArray(specs) ? specs : Object.keys(specs || {});
    if (!list.length) continue;
    const links = specLinks[name] || {};
    // The names and, where they exist, the article links, so a question about a
    // class's specializations answers with the three directions instead of falling
    // back to the class overview (the owner's "проводник не выдаёт то, что прошу").
    const body = [
      `${name}: ${list.join(', ')}.`,
      ...list.map((s) => (links[s] ? `${s}: ${links[s]}` : '')).filter(Boolean)
    ].join('\n');
    add(`spec:${name}`, pick('ru', `Специализации ${name}`, `${name} specializations`), body,
      'class', ['специализация', 'специализации', 'специализациям', name, 'spec'],
      { specClass: name, specNames: list, specBriefs: specBriefs[name] || {}, specLinks: links });
    // Each direction also answers on its own: its essence and its 16–50 abilities.
    for (const s of list) {
      const levels = (specDetail[s] || {}).levels || [];
      const parts = [
        specBriefs[name] && specBriefs[name][s] ? `${s} — ${specBriefs[name][s]}.` : `${s}.`,
        levels.length ? levels.map((lv) => `${lv.level} уровень: ${lv.abilities.join('; ')}`).join('\n') : ''
      ].filter(Boolean);
      add(`spec-det:${s}`, pick('ru', `Специализация ${s}`, `Specialization ${s}`), parts.join('\n'),
        'class', ['специализация', 'способности', 'умения', name, s],
        { specName: s, specOwner: name, specLevels: levels, specBrief: (specBriefs[name] || {})[s] || '' });
    }
  }
  if (Object.keys(classes.specializations || {}).length) {
    add('spec-all', pick('ru', 'Специализации классов', 'Class specializations'),
      Object.entries(classes.specializations).map(([n, s]) => `${n}: ${(Array.isArray(s) ? s : Object.keys(s || {})).join(', ')}.`).join('\n'),
      'class', ['специализация', 'специализации', 'специализации классов', 'spec'], { specAll: true });
  }
  if (classes.class_system) add('class-system', pick('ru', 'Система классов', 'Class system'), classes.class_system, 'class', ['класс', 'система', 'уровни']);
  if (classes.milestones) {
    const ms = classes.milestones;
    add('milestones', pick('ru', 'Вехи и специализации', 'Milestones and specializations'), pick('ru',
      `Вехи: 20, 30, 40, 50. На 16 уровне игрок выбирает одну из ${ms.specializations_per_class || 3} специализаций класса. `
        + `Между вехами промежуточные уровни — ${(ms.structure || []).map((s) => `${s.levels} (до ${s.milestone})`).join(', ')} — `
        + `и на каждом ровно одна способность специализации. Всего ${ms.total_specialization_levels} уровней специализации.`,
      `Milestones: 20, 30, 40, 50. At level 16 a player picks one of the class's ${ms.specializations_per_class || 3} specializations. `
        + `Between milestones: ${(ms.structure || []).map((s) => `${s.levels} (to ${s.milestone})`).join(', ')}, one specialization ability each.`
    ), 'class', ['веха', 'вехи', 'специализация', 'специализации', 'уровни', '16 уровень']);
  }
  if (classes.class_balance_rules) add('class-rules', pick('ru', 'Правила баланса классов', 'Class balance rules'), classes.class_balance_rules.map((r) => `— ${r}`).join('\n'), 'class', ['класс', 'баланс', 'правила']);
  if ((classes.player_classes || []).length) {
    add('class-players', pick('ru', 'Классы игроков', 'Player classes'), classes.player_classes.map((c) => `${c.name} — ${c.author}${c.url ? ` (${c.url})` : ''}`).join('\n'), 'class', ['классы', 'игроки'], { playerList: true });
  }

  const lp = classes.level_pass || {};
  if (lp.tiers) {
    add('levelpass', pick('ru', 'Пасс уровней', 'Level pass'), [
      lp.note || '',
      ...lp.tiers.map((t) => `${t.name} (${t.range}): ` + t.rewards.map((r) => `${r.level} — ${r.reward}`).join('; '))
    ].filter(Boolean).join('\n'), 'levelpass', ['пасс', 'уровни', 'награды', 'level']);
  }

  const tpl = k.character_template || {};
  if (tpl.fields) {
    // The full sheet, not the shortened form: the owner wants the whole template
    // printed, and a player asking for it should see every field and stat block.
    add('template', pick('ru', 'Шаблон анкеты персонажа', 'Character sheet template'),
      fullCharacterTemplate('ru'), 'template', ['шаблон', 'анкета', 'персонаж', 'полная анкета']);
  }

  if (k.story_template) add('story', pick('ru', 'Шаблон заявки на сюжет для ГМ', 'Plot application template'), k.story_template, 'template', ['сюжет', 'гм', 'шаблон']);
  if (k.entry_process) add('entry', pick('ru', 'Как вступить', 'How to join'), k.entry_process, 'chat', ['вступить', 'анкета', 'проверка', 'join']);

  const adm = k.administration || {};
  if (adm.intro || adm.levels_note) {
    add('admin', pick('ru', 'Администрация', 'Administration'), [
      adm.intro || '', adm.levels_note || '', adm.growth || ''
    ].filter(Boolean).join('\n'), 'admin', ['администрация', 'команда', 'ступени']);
  }
  for (const r of adm.roles || []) {
    add(`admin:${r.key}`, pick('ru', `Направление: ${r.name}`, `Branch: ${r.name}`), [
      r.name, r.practice ? `Практикант: ${r.practice}` : '', r.main ? `Основная степень: ${r.main}` : '',
      r.chief ? `Главный: ${r.chief}` : '', r.pace ? `Активность: ${r.pace}` : ''
    ].filter(Boolean).join('\n'), 'admin', ['администрация', r.name, r.key], { role: r });
  }

  for (const a of engArticles) {
    if (!a || !a.title) continue;
    // Player races and classes read from the blog are searched alongside the rest,
    // so "в двух словах про расу игроков Разумные цветы" is answered from the post.
    const kind = a.kind === 'race' || a.kind === 'class' ? a.kind : (a.kind || 'article');
    add(`article:${a.slug || a.title}`, a.title, a.text || a.title, kind, [a.kind || '', 'статья', a.title, 'игрок']);
  }

  return docs;
}

let docsRef = null;
let docsCache = [];
function docs() {
  const k = getKnowledge();
  if (docsRef !== k) { docsRef = k; docsCache = buildDocs(k); }
  return docsCache;
}

// ---------------------------------------------------------------- retrieval

// Score by where a query token was found: the title counts most, then the tags,
// then the body. A token that appears in almost every document ("класс") carries
// little signal, so its weight is divided by how common it is. Without that,
// "расскажи про класс Флагеллант" would match the class list on the shared word
// and beat the one article that is actually about Флагеллант.
export function retrieve(query, list, limit = 3) {
  const qs = new Set(tokens(query));
  if (!qs.size) return [];

  const total = list.length || 1;
  const df = new Map();
  const prepared = list.map((d) => {
    const title = tokenSet(d.title);
    const tags = tokenSet((d.tags || []).join(' '));
    const body = tokenSet(d.text);
    for (const t of new Set([...title, ...tags, ...body])) df.set(t, (df.get(t) || 0) + 1);
    return { doc: d, title, tags, body };
  });
  const idf = (t) => 1 + Math.log(total / (df.get(t) || 1));

  const scored = [];
  for (const p of prepared) {
    let score = 0;
    for (const t of qs) {
      const w = p.title.has(t) ? 4 : p.tags.has(t) ? 2 : p.body.has(t) ? 1 : 0;
      if (w) score += w * idf(t);
    }
    if (score > 0) scored.push({ doc: p.doc, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

// ------------------------------------------------------------------ phrasing

const linkLine = (lang) => {
  const chat = getKnowledge().chat || {};
  return pick(lang, `Ссылка на чат: ${chat.telegram}.`, `Chat link: ${chat.telegram}.`);
};

function renderDoc(doc, lang, level) {
  if (doc.kind === 'class' && doc.data) {
    const d = doc.data;
    return [
      `${pick(lang, 'Класс', 'Class')} ${doc.name}.`,
      `${pick(lang, 'Ресурс', 'Resource')}: ${d.resource}.`,
      `${pick(lang, 'Старт', 'Start')}: ${d.start}.`,
      `${pick(lang, 'Базовая атака', 'Basic attack')}: ${d.basic_attack}.`,
      `${pick(lang, 'Способности', 'Abilities')}: ${d.abilities}.`,
      `${pick(lang, 'Истощение', 'Exhaustion')}: ${d.exhaustion}.`
    ].join('\n');
  }
  // A class or specialization ability list can be narrowed to one level, so
  // "способности первого уровня" returns the first-level abilities rather than all
  // fifteen rows or, worse, the level-pass rewards.
  if ((doc.classLevels || doc.specLevels) && level) {
    const levels = doc.classLevels || doc.specLevels;
    const row = levels.find((l) => l.level === level);
    const title = doc.classLevels ? pick(lang, `Способности ${doc.name}`, `${doc.name} abilities`) : doc.specName;
    if (!row) return `${title}: ${pick(lang, `на ${level} уровне способностей нет.`, `no abilities at level ${level}.`)}`;
    return `${title} — ${level} ${pick(lang, 'уровень', 'level')}:\n${row.abilities.map((a) => `— ${a}`).join('\n')}`;
  }
  return doc.text;
}

// "А можно ты просто расскажешь в двух словах?" is a request for the gist, not for
// the whole stored text again. Without this the Guide re-printed the full branch
// description and read as if it had ignored the player.
const BRIEF_RE = /(в|на)\s+двух\s+словах|вкратце|покороче|покоротче|сократи|сокращ[аеё]|сжато|тезисно|не\s+так\s+подробно|без\s+подробностей|по\s+сути|в\s+общих\s+чертах|в\s+общем|кратко|коротко|\bсуть\b|in\s+short|briefly|tldr|tl;dr|short\s+version|summar/i;
const wantsBrief = (text) => BRIEF_RE.test(String(text || ''));

const lowerFirst = (s) => {
  const t = String(s || '').trim();
  return t ? t.charAt(0).toLowerCase() + t.slice(1) : t;
};

// The first couple of readable lines, used as the gist of a blog post when it has
// no stored brief of its own. The name line is dropped (it only repeats the title),
// and the class posts' own field labels are shortened.
function leadingLines(text, n = 2) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean)
    .filter((l) => !/^Название\s+(народа|класса)\s*:/i.test(l));
  return lines.slice(0, n).join(' ')
    .replace(/^Краткое\s+описание[^:]*:\s*/i, '')
    .replace(/^Концепция[^:]*:\s*/i, 'Стиль: ')
    .replace(/\s+/g, ' ').trim();
}

// A two-sentence gist of an administration branch: what the main degree does, and
// the expected pace. The branch's stored text stays the long answer.
function briefRole(role) {
  const lead = String(role.main || role.practice || '').split(',')[0].trim().replace(/[.;:]+$/, '');
  const head = lead ? `${role.name} — ${lowerFirst(lead)}.` : `${role.name}.`;
  return [head, role.pace || ''].filter(Boolean).join(' ');
}

// A one-line essence per base class, from the stored brief.
function briefClass(doc) {
  return doc.classBrief ? `${doc.name} — ${doc.classBrief}.` : doc.text;
}

// A one-line essence per base race, from the stored brief.
function briefRace(doc) {
  return doc.raceBrief ? `${doc.raceBriefName || doc.raceName} — ${doc.raceBrief}.` : doc.text;
}

// All base races, one line each: "расскажи в двух словах про расы".
function briefRaceList(doc) {
  return Object.entries(doc.raceBriefs || {}).map(([name, b]) => `${name} — ${b}.`).join('\n');
}

// "Что это за специализации?" is answered with the essence of each direction, so
// the player learns what Элементалист / Арканный маг / Хронист actually do instead
// of only seeing their names.
function briefSpecs(doc) {
  const briefs = doc.specBriefs || {};
  const lines = (doc.specNames || []).map((s) => `${s} — ${briefs[s] || 'смотри статью'}.`);
  return [`${doc.specClass} — специализации:`, ...lines].join('\n');
}

// A player race or class read from the blog has no stored brief, so its own opening
// lines serve as the gist.
function briefPlayer(doc) {
  const lead = leadingLines(doc.text, 2);
  return lead ? `${doc.title}: ${lead}` : doc.title;
}

// The gist of any document: a stored brief when there is one, otherwise the first
// two sentences. This is what "в двух словах" asks for.
function briefDoc(doc, lang) {
  if (doc.specNames) return briefSpecs(doc);
  // The class-specialization overview and the player lists are already compact: a
  // list of names reads as a gist on its own.
  if (doc.specAll || doc.playerList) return doc.text;
  if (doc.role) return briefRole(doc.role);
  if (doc.raceBriefs && !doc.raceName) return briefRaceList(doc);
  if (doc.raceName) return briefRace(doc);
  if (doc.classBrief) return briefClass(doc);
  if (doc.kind === 'race' || doc.kind === 'class') return briefPlayer(doc);
  const text = renderDoc(doc, lang).replace(/\s+/g, ' ').trim();
  if (!text) return doc.title;
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  return `${doc.title}: ${sentences.slice(0, 2).join(' ').trim()}`;
}

const wantsLink = (text) => /ссылк|ссылоч|link|приглашен|invite|где\s+чат|куда\s+писать/i.test(String(text || ''));

// "Как выглядит эльф?" asks for the race's appearance, not for whom it likes. The
// relations document was winning on the race name alone and answering the wrong
// question, so a looks question is routed to the race profile and shown appearance
// first.
const LOOK_RE = /как\s+выгляд|выглядит|выглядят|внешн|внешний\s+вид|опиши|описание|похож|appearance|what\s+.*look|look\s+like/i;
const wantsLook = (text) => LOOK_RE.test(String(text || ''));

// A short follow-up about one field of the entity just discussed ("а уязвимости?",
// "а способности?") names no entity either, so it borrows the previous turn too.
const FOLLOW_FIELD_RE = /выгляд|внешн|уязвим|слабост|отношен|образ\s+жизни|устройств|продолжительност|способност|умени|навык|истощени/i;

// When a follow-up names one field, only that field is shown, so "а уязвимости?"
// answers with the weaknesses rather than the whole profile again.
const FIELD_FOCUS = [
  [/выгляд|внешн|appearance/i, ['Внешность']],
  [/уязвим|слабост/i, ['Уязвимости и слабые стороны']],
  [/образ\s+жизни|среда|быт/i, ['Образ жизни и среда обитания']],
  [/боевые|физическ|в бою/i, ['Боевые и физические особенности']],
  [/общественн|устройств|правит/i, ['Общественное устройство']],
  [/продолжительност|живут|сколько\s+жив/i, ['Продолжительность жизни']],
  [/маги/i, ['Отношение к магии']],
  [/вер[аеу]|религи/i, ['Вера']],
  [/отношен|дружб|враж|другие\s+расы/i, ['Отношения']]
];
function fieldFocus(text) {
  const s = String(text || '');
  const keys = [];
  for (const [re, fields] of FIELD_FOCUS) if (re.test(s)) keys.push(...fields);
  return keys;
}

// A continuation that still talks about the entity just discussed without naming
// it: "А чем они отличаются от других расс?", "а какие у них плюсы и минусы?".
// Without folding the previous turn in, the retrieval drifts to an unrelated
// document - the owner's race question came back as the character template and, on
// the live model, as another player's race.
const COMPARE_RE = /отлича|различ|сравн|сильнее|слабее|лучше|хуже|преимуществ|недостат|(?:^|[^а-яёa-z])(?:плюс|минус)|против\s+друг|по\s+сравнению|над\s+другими|перед\s+другими/i;
// JS \b is ASCII-only and never fires between Cyrillic letters, so the pronouns
// carry their own boundaries.
const ANAPHORA_RE = /(?:^|[^а-яёa-z])(?:они|она|оно|он|их|них|него|неё|нее|ему|ей)(?![а-яёa-z])/i;

// The comparison answer for a race. "Чем они отличаются от других расс" is not a
// request for the appearance: dumping the profile's field list just repeats the
// looks answer and says nothing about the others. So the essence (strengths and
// weaknesses) comes first, then the relations with each other race - that is what
// the question actually compares.
function renderRaceComparison(doc, lang) {
  const name = doc.raceDetailsName || doc.raceName;
  const rel = raceRelationsDoc(name);
  const head = `${pick(lang, 'Чем отличается', 'How it differs')} ${name} ${pick(lang, 'от других рас', 'from other races')}:`;
  const essence = doc.raceBrief ? `${name} — ${doc.raceBrief}.` : '';
  return [head, essence, '', rel ? rel.text : ''].filter((p) => p !== undefined).join('\n').trim();
}

// The class counterpart: a class is not compared by relations but by what it is for
// and how it plays. "Чем маг отличается от других классов" gets the class's essence,
// its resource and attack, and its three specializations - the ways it can branch,
// which is how the classes actually differ.
function renderClassComparison(doc, lang) {
  const d = doc.data || {};
  const name = doc.name;
  const specDoc = docs().find((s) => s.id === `spec:${name}`);
  const specs = specDoc ? specDoc.specNames : [];
  const head = `${pick(lang, 'Чем отличается', 'How it differs')} ${name} ${pick(lang, 'от других классов', 'from other classes')}:`;
  const lines = [
    head,
    doc.classBrief ? `${name} — ${doc.classBrief}.` : '',
    d.resource ? `${pick(lang, 'Ресурс', 'Resource')}: ${d.resource}.` : '',
    d.basic_attack ? `${pick(lang, 'Базовая атака', 'Basic attack')}: ${d.basic_attack}.` : '',
    specs.length ? `${pick(lang, 'Специализации', 'Specializations')}: ${specs.join(', ')}.` : ''
  ];
  return lines.filter(Boolean).join('\n');
}

const ORDINALS = {
  '1': 1, 'перв': 1, '2': 2, 'втор': 2, '3': 3, 'трет': 3, '4': 4, 'четверт': 4, '5': 5, 'пят': 5,
  '6': 6, 'шест': 6, '7': 7, 'седьм': 7, '8': 8, 'восьм': 8, '9': 9, 'девят': 9, '10': 10, 'десят': 10,
  '11': 11, 'одиннадцат': 11, '12': 12, 'двенадцат': 12, '13': 13, 'тринадцат': 13, '14': 14, 'четырнадцат': 14,
  '15': 15, 'пятнадцат': 15
};

// "способности первого уровня", "что на 5 уровне", "уровень 3", and the terse
// "способности 14". Returns the level number or 0 when the question is not pinned
// to one.
function levelFromQuery(text) {
  const s = String(text || '').toLowerCase().replace(/ё/g, 'е');
  let m = s.match(/уровен[ья][\s-]*(\d{1,2})/);
  if (m) return Number(m[1]);
  m = s.match(/(\d{1,2})\s*(?:-?го\s*)?уровн/);
  if (m) return Number(m[1]);
  // "способности 14" / "способности на 14" — no word "уровень" at all.
  m = s.match(/способност[а-я]*\s*(?:на\s+)?(\d{1,2})/);
  if (m) return Number(m[1]);
  for (const [key, value] of Object.entries(ORDINALS)) {
    if (new RegExp(`(?:^|[^а-яa-z])${key}[а-я]*\\s+уровн`).test(s)) return value;
  }
  return 0;
}

// A race is known by its singular base name ("Человек", "Эльф"), but players write
// the plural everyday word ("люди", "эльфы", "дворфы"). The plural is a different
// stem, so retrieval on the noun alone can miss the race and the pronoun rule then
// fails to see the entity, folding in the wrong previous turn. Each entry maps a
// written form to the base name it means.
const RACE_ALIASES = {
  'человек': ['люди', 'людей', 'людям', 'людьми', 'людях', 'людь', 'человек', 'люд'],
  'эльф': ['эльф', 'эльфы', 'эльфов', 'эльфам', 'эльфами', 'эльфах'],
  'драконорождённый': ['драконорожденный', 'драконорождённые', 'драконорожденные', 'драконы', 'дракон', 'драконам', 'драконами'],
  'дворф': ['дворф', 'дворфы', 'дворфов', 'дворфам', 'дворфами', 'гном', 'гномы', 'гномов'],
  'орк': ['орк', 'орки', 'орков', 'оркам', 'орками', 'орках'],
  'павший': ['павший', 'павшие', 'павших', 'павшим', 'павшими']
};

// The base race name a piece of text refers to, or '' when it names none. Both the
// canonical name and every alias are matched.
function raceNameIn(text) {
  const s = String(text || '').toLowerCase().replace(/ё/g, 'е');
  for (const [base, forms] of Object.entries(RACE_ALIASES)) {
    const all = [base.replace(/ё/g, 'е'), ...forms];
    if (all.some((f) => hasWord(s, f))) return base;
  }
  return '';
}

// The base classes, known by the same everyday inflections the races are. The
// short stem "маг" must not swallow "магия" or "магический", so matching is
// boundary-aware rather than a substring test.
const CLASS_ALIASES = {
  'Воин': ['воин', 'воины', 'воинов', 'воинам', 'воинами', 'воина'],
  'Лучник': ['лучник', 'лучники', 'лучников', 'лучникам', 'лучниками', 'лучника'],
  'Маг': ['маг', 'маги', 'магов', 'магам', 'магами', 'магах', 'мага'],
  'Некромант': ['некромант', 'некроманты', 'некромантов', 'некромантам', 'некромантами', 'некроманта'],
  'Чернокнижник': ['чернокнижник', 'чернокнижники', 'чернокнижников', 'чернокнижникам', 'чернокнижника']
};

// A Cyrillic-safe whole-word test: JS \b is ASCII-only and never fires between
// Cyrillic letters, so the boundaries are written out.
function hasWord(s, w) {
  if (!w) return false;
  const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^а-яёa-z])${escaped}(?![а-яёa-z])`).test(s);
}

// The base class name a piece of text refers to, or '' when it names none.
function classNameIn(text) {
  const s = String(text || '').toLowerCase().replace(/ё/g, 'е');
  for (const [base, forms] of Object.entries(CLASS_ALIASES)) {
    const all = [base.toLowerCase().replace(/ё/g, 'е'), ...forms];
    if (all.some((f) => hasWord(s, f))) return base;
  }
  return '';
}

// The canonical stored name behind a matched alias ("мага" -> "Маг", "эльфов" ->
// "эльф"), so a caller that found the alias still looks up the real document.
function canonicalName(name) {
  const n = String(name || '').toLowerCase().replace(/ё/g, 'е');
  for (const [base, forms] of Object.entries(CLASS_ALIASES)) {
    if (n === base.toLowerCase().replace(/ё/g, 'е') || forms.includes(n)) return base;
  }
  for (const [base, forms] of Object.entries(RACE_ALIASES)) {
    if (n === base || forms.includes(n)) return base;
  }
  return name;
}

// The names the corpus can answer about, used to tell "он/она" (no topic) from a
// real question that merely lacks a noun.
function knownNames() {
  const k = getKnowledge() || {};
  const names = new Set();
  for (const n of Object.keys(k.classes?.base_classes || {})) names.add(n.toLowerCase());
  for (const n of k.races?.list || []) names.add(String(n).toLowerCase());
  for (const n of Object.keys(k.races?.details || {})) names.add(String(n).toLowerCase());
  // The everyday plural forms ("люди", "эльфы", "маги") count as naming the entity too.
  for (const forms of Object.values(RACE_ALIASES)) for (const f of forms) names.add(f);
  for (const forms of Object.values(CLASS_ALIASES)) for (const f of forms) names.add(f);
  for (const list of Object.values(k.classes?.specializations || {})) {
    for (const s of (Array.isArray(list) ? list : Object.keys(list || {}))) names.add(String(s).toLowerCase());
  }
  for (const r of k.races?.player_races || []) names.add(String(r.name || '').toLowerCase());
  for (const c of k.classes?.player_classes || []) names.add(String(c.name || '').toLowerCase());
  return names;
}

function mentionsEntity(text) {
  const s = String(text || '').toLowerCase();
  for (const name of knownNames()) {
    if (name && s.includes(name)) return true;
  }
  return false;
}

// A question can ask about several classes at once: "способности 15 уровня мага и
// 10 некроманта". Each "class + level" pair is a separate answer, so they are
// detected and answered one after another instead of only the last one.
function abilityRequests(text) {
  const s = String(text || '').toLowerCase().replace(/ё/g, 'е');
  if (!/способност|умени|навык/.test(s)) return [];
  const names = [...knownNames()].sort((a, b) => b.length - a.length);
  const out = [];
  for (const seg of s.split(/[,;]|\s+и\s+|\s+плюс\s+|\s+а\s+также\s+/)) {
    if (!seg.trim()) continue;
    // The level can stand alone before the class ("10 некроманта"), so a bare
    // number is accepted as the level when the usual "уровня" wording is absent.
    const bare = Number((seg.match(/\b(\d{1,2})\b/) || [])[1] || 0);
    const lvl = levelFromQuery(seg) || bare;
    if (!lvl) continue;
    const name = names.find((n) => seg.includes(n));
    if (name) out.push({ name: canonicalName(name), level: lvl });
  }
  return out;
}

// The per-level ability list for one class, used for the multi-class questions.
function renderAbilityList(name, level, lang) {
  const doc = docs().find((d) => d.classLevels && String(d.name).toLowerCase() === String(name).toLowerCase());
  if (!doc) return '';
  return `${doc.title}:\n${renderDoc(doc, lang, level)}`;
}

function abilityAnswers(text, lang) {
  return abilityRequests(text).map((r) => renderAbilityList(r.name, r.level, lang)).filter(Boolean);
}

// The race profile, appearance first: that is the question a looks query asks. When
// the follow-up names one field ("а уязвимости?"), only that field is shown.
function renderRaceDetails(doc, lang, focus) {
  const fields = doc.raceFields || {};
  const order = ['Внешность', 'Образ жизни и среда обитания', 'Боевые и физические особенности', 'Уязвимости и слабые стороны', 'Общественное устройство', 'Продолжительность жизни', 'Отношение к магии', 'Вера'];
  let keys = [...order.filter((k) => fields[k]), ...Object.keys(fields).filter((k) => !order.includes(k) && k !== 'Название народа')];
  if (focus && focus.length) {
    const wanted = focus.filter((k) => fields[k]);
    if (wanted.length) keys = keys.filter((k) => wanted.includes(k));
  }
  return [`${pick(lang, 'Раса', 'Race')} ${doc.raceDetailsName || doc.raceName}:`, ...keys.map((k) => `${k}: ${fields[k]}`)].join('\n');
}

// The relations document for a race, used when a follow-up asks about them.
function raceRelationsDoc(raceName) {
  return docs().find((d) => d.id.startsWith('race-rel:') && String(d.raceName).toLowerCase() === String(raceName).toLowerCase());
}

// Chooses the document that answers the latest turn, applying the same routing the
// local answer uses: brevity, appearance, list and level questions, and pronoun
// resolution. Shared so the model prompt can be given the same source text.
function pickAnswer(history) {
  const last = [...history].reverse().find((m) => m.role !== 'assistant');
  const q = String(last?.content || '');
  const brief = wantsBrief(q);
  const look = wantsLook(q);
  const level = levelFromQuery(q);
  const focus = fieldFocus(q);
  const abilityFocus = /способност|умени|навык/i.test(q);
  // "А уязвимости?", "а способности?" — a short follow-up about a field of the entity
  // just discussed. It names no entity, so it borrows the previous turn too.
  const followUp = FOLLOW_FIELD_RE.test(q) && tokens(q).length <= 2;
  // A longer continuation ("А чем они отличаются от других расс?") names no entity
  // either, so it borrows the previous turn as well; otherwise the retrieval leaves
  // the race behind and answers with an unrelated document.
  const continuation = !mentionsEntity(q) && (COMPARE_RE.test(q) || ANAPHORA_RE.test(q));
  const compare = COMPARE_RE.test(q);
  const priorTurns = [...history].reverse()
    .filter((m) => m.role !== 'assistant' && String(m.content || '') !== q)
    .map((m) => String(m.content || ''));
  const prior = priorTurns[0] || '';
  const priorEntity = priorTurns.find((c) => mentionsEntity(c)) || '';
  let query = q;
  if ((brief || look || followUp || continuation) && !mentionsEntity(q)) {
    if (prior && tokens(prior).length) query = `${prior} ${q}`;
  }
  let hits = retrieve(query, docs(), 3);
  // A comparison names its subject ("чем люди отличаются от других"), but the
  // everyday plural ("люди") and the short stem ("маг") are not the stored key, so
  // the right profile can lose the match and the answer compares the wrong thing.
  // Only the comparison forces the named entity to the front; a sub-aspect question
  // ("специализации мага") keeps its own document.
  if (compare) {
    const race = raceNameIn(q);
    const cls = classNameIn(q);
    const wantId = race ? `race-det:${race}` : cls ? `class:${cls}` : '';
    if (wantId) {
      const own = docs().find((d) => d.id === wantId);
      if (own) hits = [{ doc: own, score: 99 }, ...hits.filter((h) => h.doc !== own)];
    }
  }
  // "Какие есть классы?" scores on the shared word "класс", which every class
  // document contains. Prefer the overview in that case so the answer is the list.
  if (LIST_RE.test(q)) {
    const overview = hits.find((h) => isListDoc(h.doc));
    if (overview) hits = [overview, ...hits.filter((h) => h !== overview)];
  }
  // A looks question belongs to the race profile, not to the relations document that
  // happens to share the race name. The profile wins when it is among the hits.
  if (look) {
    const profile = hits.find((h) => h.doc.raceFields);
    if (profile) hits = [profile, ...hits.filter((h) => h !== profile)];
  }
  // "А способности?" after a class means the class's per-level ability list, not the
  // overview whose "Способности: 5–15 выносливости" is only the resource cost.
  if (abilityFocus && !mentionsEntity(q) && priorEntity) {
    const list = hits.find((h) => h.doc.classLevels && priorEntity.toLowerCase().includes(String(h.doc.name).toLowerCase()));
    if (list) hits = [list, ...hits.filter((h) => h !== list)];
  }
  // "Способности первого уровня" carries no class name, so the previous turn supplies
  // it. Among equally-scored ability lists, prefer the one for that class.
  if (level && !mentionsEntity(q) && priorEntity) {
    const named = hits.find((h) => h.doc.classLevels && priorEntity.toLowerCase().includes(String(h.doc.name).toLowerCase()));
    if (named) hits = [named, ...hits.filter((h) => h !== named)];
  }
  const best = hits[0];
  // "А отношения?" names the relations field, so the relations document answers even
  // though the race profile also matches on the race name.
  if (focus.includes('Отношения') && best && best.doc.raceName) {
    const rel = raceRelationsDoc(best.doc.raceDetailsName || best.doc.raceName);
    if (rel) return { q, brief, look, followUp, focus, level, best: rel };
  }
  return { q, brief, look, followUp, focus, level, compare, best: best && best.score >= 2 ? best.doc : null };
}

// The source text for the model prompt: the same document the local answer would use,
// rendered the same way. Without it the live model has no appearance or per-level
// facts and guesses, which is how "как выглядит эльф" produced the relations text.
export function guideReference({ messages = [], lang = 'ru' } = {}) {
  const history = Array.isArray(messages) ? messages : [];
  const last = [...history].reverse().find((m) => m.role !== 'assistant');
  const multi = abilityAnswers(String(last?.content || ''), lang);
  if (multi.length > 1) return multi.join('\n\n');
  const { brief, look, followUp, focus, level, compare, best } = pickAnswer(history);
  if (!best) return multi[0] || '';
  if (compare && best.raceFields) return renderRaceComparison(best, lang);
  if (compare && best.data) return renderClassComparison(best, lang);
  if ((look || followUp) && best.raceFields) return renderRaceDetails(best, lang, focus);
  if (brief) return briefDoc(best, lang);
  return renderDoc(best, lang, level);
}

// The Guide answers from the corpus. A confident hit is answered with the stored
// text; a weak one is admitted as unknown rather than guessed, which keeps the
// chat honest.
export function localGuide({ messages = [], lang = 'ru' } = {}) {
  const history = Array.isArray(messages) ? messages : [];
  const last = [...history].reverse().find((m) => m.role !== 'assistant');
  const q = String(last?.content || '');
  // A request for the template gets the whole sheet, not the shortened entry from
  // the corpus: the owner asked for the full form, not an abridged one.
  if (wantsTemplate(q)) return fullCharacterTemplate(lang);
  // Two classes asked together ("способности 15 мага и 10 некроманта") get two answers.
  const multi = abilityAnswers(q, lang);
  if (multi.length > 1) return multi.join('\n\n');
  const { brief, look, followUp, focus, level, compare, best } = pickAnswer(history);
  if (!best) {
    return [
      pick(lang, 'Честно: в моих материалах нет ответа на этот вопрос.', 'Honestly, my materials have no answer to that.'),
      pick(lang, `Спроси администрацию в чате: ${getKnowledge().chat?.telegram}.`, `Ask the administration in the chat: ${getKnowledge().chat?.telegram}.`)
    ].join('\n');
  }
  if (brief) return briefDoc(best, lang);
  if (compare && best.raceFields) return renderRaceComparison(best, lang);
  if (compare && best.data) return renderClassComparison(best, lang);
  if ((look || followUp) && best.raceFields) return renderRaceDetails(best, lang, focus);
  const body = renderDoc(best, lang, level);
  const tail = wantsLink(q) || best.kind === 'chat' ? linkLine(lang) : '';
  return [`${best.title}:`, body, tail].filter(Boolean).join('\n');
}

// The full character sheet template, in the player's own wording, so asking for the
// template prints every field and stat block instead of the shortened form. The
// owner asked for the complete sheet: "я буду тебя просить что бы ты засунул полную
// анкету, а не сократил её". The stat names come from the knowledge base, so a change
// there is reflected here with no code edit.
function fullCharacterTemplate(lang) {
  const fields = (getKnowledge().character_template || {}).fields || {};
  const statBlock = (name, fallback) => {
    const block = fields[name];
    const stats = (block && block.stats) || fallback;
    return [
      `${name} (${(block && block.rule) || 'может быть только один показатель на 10, два на 8, один на 7'}):`,
      '',
      ...stats.map((s) => `${s}: 0–10`),
      '',
      '',
      'Необязательно:',
      `Сильные стороны: (${(block && block.strong_sides) || '2–3 пункта'})`,
      `Слабые стороны: (${(block && block.weak_sides) || '2–3 пункта, обязательно!'})`,
      `Особые умения: (${(block && block.special_moves) || 'если есть'})`
    ].join('\n');
  };
  if (lang === 'en') {
    return [
      'Character sheet template', '', 'Name:', 'Nickname:', 'Height / weight:', 'Gender:',
      'Orientation:', 'Character traits:', '1. Strengths:', '2. Weaknesses:', 'Race:', 'Class:',
      'Age:', 'Hobbies:', 'Interesting facts: unusual events in the character\'s life',
      'Origin: (at least 2-3 sentences of backstory)', 'Appearance:', 'Distinctive features:',
      'Starting gear:', '', statBlock('Physical characteristics', ['Strength', 'Speed', 'Agility', 'Endurance', 'Health', 'Reaction']),
      '', statBlock('Intellectual abilities', ['Cunning', 'Intellect', 'Resourcefulness', 'Guile', 'Aggression', 'Kindness', 'Charisma', 'Empathy'])
    ].join('\n');
  }
  return [
    'Шаблон анкеты', '',
    'Имя:',
    'Прозвище:',
    'Рост / вес:',
    'Пол:',
    'Ориентация:',
    'Черты характера:',
    '1. Преимущества:',
    '2. Недостатки:',
    'Раса:',
    'Класс:',
    'Возраст:',
    'Хобби:',
    'Интересные факты: необычные события из жизни персонажа',
    'Происхождение: (минимум 2-3 предложения предыстории)',
    'Внешность:',
    'Особенности внешности:',
    'Стартовое снаряжение:',
    '',
    statBlock('Физические характеристики', ['Сила', 'Скорость', 'Ловкость', 'Выносливость', 'Здоровье', 'Реакция']),
    '',
    statBlock('Интеллектуальные способности', ['Хитрость', 'Интеллект', 'Сообразительность', 'Изворотливость', 'Агрессивность', 'Доброта', 'Харизма', 'Эмпатия'])
  ].join('\n');
}

// Whether the question is asking for the template itself, so the full sheet is
// printed rather than the short entry from the knowledge base.
export const wantsTemplate = (text) => /шаблон|template|полн[а-яё]*\s+анкет|форму\s+анкет/i.test(String(text || ''));

// -------------------------------------------------------------- interviewer

const isGreeting = (text) => /^\s*(привет|здравствуй|хай|добрый|hi|hello|hey|доброе|салют)/i.test(String(text || ''));
const isAddCmd = (text) => /добавь в анкету|add to the application/i.test(String(text || ''));
const isShowCmd = (text) => /покажи анкету|show application|моя анкета/i.test(String(text || ''));
const isCheckCmd = (text) => /проверь|проверить|check my|проверка анкеты/i.test(String(text || ''));
// "Сделай сам" — the player asks the Interviewer to author the sheet instead of
// answering the checklist. This is a distinct request from "хочу расу": the latter
// opens the walk, this one asks the interviewer to do the work. "Я сам" is the
// opposite — the player wants to write it — so it is excluded.
function isSelfMade(text) {
  const s = String(text || '');
  if (/(?<![а-яё])я\s+сам/i.test(s)) return false;
  return /(?<![а-яё])сам(а|и|о|е|ому|ой|ого|им|их)?(?![а-яё])|за\s+меня|для\s+меня|мне\s+сам|придума(й|йте|ть)|(?<![а-яё])сделай|(?<![а-яё])создай|сгенерируй|на\s+свой\s+вкус|на\s+тво[её]\s+усмотрение|твой\s+вариант|yourself|for me|make it|create it/i.test(s);
}

// A clear "finish the rest for me" inside a walk, where the player names no race or
// class: "Можешь сам всё дальше придумать?", "придумай остальное сам", "доделай за
// меня". The noun gate used to drop these and the interviewer answered "Хороший
// вопрос" and offered the very same handover back. The verb list is explicit so an
// ordinary answer that happens to contain "сами" ("они сами по себе") is not read as
// a request to author the sheet.
const FINISH_REQUEST = new RegExp([
  '(?<![а-яё])сам[аиое]?\\s+(?:всё|все|остальн[а-яё]*|дальше)',
  '(?:придума|сдела|законч|додел|дорису|заполн)[а-яё]*\\s+(?:всё|все|остальн[а-яё]*|дальше)',
  '(?:придума|сдела|законч|додел|дорису|заполн)[а-яё]*\\s+сам[аиое]?(?![а-яё])',
  'за\\s+меня|для\\s+меня|на\\s+свой\\s+вкус|на\\s+тво[её]\\s+усмотрение|твой\\s+вариант'
].join('|'), 'i');

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// The player hands the rest of the walk over ("Можешь сам всё дальше придумать?").
// The draft already holds their answers, so the generated sheet fills only the
// fields they left blank: the name they chose and the abilities they wrote are kept,
// and the balance rules supply the rest. Returns null outside a race/class walk or
// when the message is not a handover, so an ordinary answer is never turned into a
// generated sheet.
export function finishSheet(history, application = {}, lang = 'ru') {
  const msgs = Array.isArray(history) ? history : [];
  const app = application && typeof application === 'object' ? application : {};
  const last = [...msgs].reverse().find((m) => m && m.role !== 'assistant');
  const text = String(last?.content || '');
  if (!FINISH_REQUEST.test(text)) return null;
  if (/(?<![а-яё])я\s+сам/i.test(text)) return null;
  const kind = interviewKind(app, msgs);
  if (kind !== 'race' && kind !== 'class') return null;
  const draft = kind === 'race'
    ? generateRace(lang, seedFrom(msgs), raceConceptFrom(msgs))
    : generateClass(lang, seedFrom(msgs));
  const kept = {};
  for (const field of INTERVIEW_FIELDS[kind] || []) {
    const value = app[field];
    if (typeof value === 'string' && value.trim()) kept[field] = value.trim();
  }
  let body = draft.text;
  for (const [field, value] of Object.entries(kept)) {
    const line = new RegExp(`^${escapeRe(field)}:\\s*.*$`, 'm');
    if (line.test(body)) body = body.replace(line, `${field}: ${value}`);
  }
  return { ...draft, app: { ...draft.app, ...kept }, text: body, finished: true };
}

// A player who asks how any of this works should get an answer, not another field
// question. Recognising the help request is what makes the chat feel like a
// conversation: "а как создать расу?" is answered, then the walk continues.
function isHelpAsk(text) {
  const s = String(text || '');
  return /как\s+(мне\s+)?(создать|сделать|придумать|заполнить|начать|играть|быть)|что\s+(мне\s+)?(писать|нужно|делать|дальше|заполнять)|помоги|подскажи|объясни|не\s+знаю|не\s+понимаю|запутался|с\s+чего\s+начать|how\s+(do|can)\s+i|what\s+(do|should)\s+i|help me/i.test(s);
}

// A player who states a requirement the sheet must meet ("До 15 уровня должно быть
// не меньше 2 способностей", "перезарядки не должны быть большими") used to get
// "Отлично, вот это уже деталь" and the same field question back, which reads as
// "he did not listen". The requirement is acknowledged and the rule it names is
// quoted, so the player can see it holds. Only these two rule shapes are recognised,
// so an ordinary answer that happens to contain "не меньше" is left alone.
function ruleRequirement(text, lang) {
  const s = String(text || '').trim();
  if (!s) return '';
  if (/уровн/i.test(s) && /способност|умени|навык/i.test(s)
    && /(не\s+меньше|не\s+больше|минимум|максимум|как\s+минимум|должн|нужно|надо|\b2\b|\b3\b|две|два|пару)/i.test(s)) {
    return pick(lang,
      'Понял: на каждом уровне — не меньше двух способностей. Так и в правилах класса, и я собираю анкету по этому требованию.',
      'Got it: at least two abilities on every level. That is the class rule too, and I build the sheet to match.');
  }
  if (/пере[а-я]{0,2}рядк|кулдаун|откат/i.test(s)
    && /(больш|коротк|меньш|длинн|умен|снизь|понизь|покороче|быстр|поменьше|небол|максимум|\b2\b|\b3\b)/i.test(s)) {
    if (/не\s+везде|не\s+на\s+кажд|не\s+у\s+всех|не\s+все\s+способ|без\s+перезарядк/i.test(s)) {
      return pick(lang,
        'Понял: перезарядка не на каждой способности. На уровнях 1–15 — максимум 2–3 хода, у части способностей перезарядки нет вовсе, а у специализаций (16+) может быть больше.',
        'Got it: not every ability has a cooldown. Levels 1–15 cap at 2–3 turns, some abilities have none, and specializations (16+) may run longer.');
    }
    return pick(lang,
      'Понял: перезарядки короткие. На уровнях 1–15 — максимум 2–3 хода, у специализаций может быть больше.',
      'Got it: cooldowns stay short. Levels 1–15 cap at 2–3 turns, specializations may run longer.');
  }
  return '';
}

// A short, human reaction to the last message, so a turn reads as a reply rather
// than a form field. It carries no «...» of its own, so the field question after it
// stays the only question in the reply.
function interviewerReaction(text, lang) {
  const s = String(text || '').trim();
  if (!s) return '';
  const rule = ruleRequirement(s, lang);
  if (rule) return rule;
  if (isAdviceAsk(s)) return pick(lang, 'Хорошая мысль, давай разберём.', 'Good thought, let us look at it.');
  if (/\?\s*$/.test(s)) return pick(lang, 'Хороший вопрос.', 'Good question.');
  if (/не\s+знаю|не\s+уверен|затрудня|не\s+понимаю/i.test(s)) return pick(lang, 'Ничего, помогу разобраться.', 'No worries, I will help you figure it out.');
  if (s.length < 12) return pick(lang, 'Коротко и ясно.', 'Short and clear.');
  if (s.length >= 40) return pick(lang, 'Отлично, вот это уже деталь.', 'Nice, that is a real detail.');
  return pick(lang, 'Записал.', 'Noted.');
}

// ------------------------------------------------------------- advice (советы)

// Players ask the interviewer for advice all the time: "может, ослабить его
// способности?", "может, добавить что-нибудь?", "а это не имба?", "что улучшить?".
// There are far too many phrasings to enumerate, so this recognises the *shape* of
// an advice question — a nudge, an evaluation, or an open ask — and answers from the
// balance rules below. Anything that slips through still lands in the interviewer's
// free-form reply, which keeps the conversation useful.
export function isAdviceAsk(text) {
  const s = String(text || '').trim().toLowerCase();
  if (!s) return false;
  return /может[,\s]|может\s+быть|стоит\s+ли|не\s+стоит|следует\s+ли|не\s+лучше\s+ли|лучше\s+ли|а\s+если|что\s+если|стоило\s+бы|надо\s+ли|нужно\s+ли|можно\s+ли|правильно\s+ли|нормально\s+ли|не\s+имба|имба\s+ли|слишком\s+(сильн|слаб|мощн|жирн|слабо)|чересчур|перебор|дисбаланс|сбалансиров|баланс|усил|ослабл|ослабь|ослабить|усиль|усилить|пониз|повыс|улучш|добав(ить|ь)|докин|убрать|убер|убрал|замен(ить|и)|поменять|исправить|поправить|дополнить|дополни|придумать\s+что|предложи|посоветуй|совет|подскажи|что\s+не\s+так|что\s+тут\s+не\s+так|в\s+чём\s+проблем|как\s+(сделать|улучшить|исправить|дополнить|усилить|ослабить)|помоги\s+с|оцени|проверь\s+баланс|норм\?|ок\?|или\s+нет/i.test(s);
}

// Whether the message is asking about the sheet rather than answering the current
// field question. A plain "может, добавить что-нибудь?" during a race walk is about
// the race, so the advice answers it and the walk continues.
function adviceKind(text, app, history) {
  const s = String(text || '').toLowerCase();
  if (/сюжет|гм|квест|истори|приключен/i.test(s)) return 'story';
  if (kindFromSheetText(s)) return kindFromSheetText(s);
  return interviewKind(app, history);
}

// The balance rules the advice leans on, read from the knowledge base so a change
// there is reflected here with no code edit.
function balanceRules(kind) {
  const k = getKnowledge() || {};
  if (kind === 'race') {
    return [
      ...(k.races?.race_template_rules || []),
      'минимум две серьёзные уязвимости;',
      'максимум две школы магии;',
      'никакого бессмертия и неуязвимости.'
    ];
  }
  if (kind === 'class') {
    return [
      ...(k.classes?.class_balance_rules || []),
      'у каждой способности перезарядка в ходах;',
      'у ресурса — истощение;',
      'минимум одно ограничение и одна слабость.'
    ];
  }
  return [
    'сильные стороны должны уравновешиваться слабостями;',
    'у персонажа есть характер, мотивация и хотя бы одна уязвимость;',
    'никакой неуязвимости и «бога из машины».'
  ];
}

// A concrete, per-topic answer. The topic is matched loosely so the same advice
// serves "ослабить", "слишком сильно", "имба", "убрать способность" and so on.
function adviceTopic(text, kind) {
  const s = String(text || '').toLowerCase();
  if (/добав|докин|дополн|придумать\s+что|чего\s+не\s+хватает|не\s+хватает|что\s+ещё/i.test(s)) return 'add';
  if (/убрать|убер|лишн|замен|поменять|переработ|переделать/i.test(s)) return 'remove';
  if (/усил|повыс|слишком\s+слаб|мощн(ее|ее)|слаб(ый|о)|слабо|поднять/i.test(s)) return 'strengthen';
  if (/ослаб|пониз|слишком\s+сильн|имба|перебор|дисбаланс|жирн|читер|неуязв|бессмерт/i.test(s)) return 'weaken';
  if (/нормально|ок|окей|правильно|хорошо\s+ли|норм|сойдёт|сойдет/i.test(s)) return 'evaluate';
  if (/что\s+не\s+так|в\s+чём\s+проблем|ошибк|проблем|замечан|замечани/i.test(s)) return 'problems';
  if (/что\s+улучшить|улучш|доделать|доработ|как\s+лучше|идеи|посовет|совет|предложи|подскажи/i.test(s)) return 'improve';
  return 'general';
}

// The advice body. Each topic says what to change and why, so the player can act on
// it, and the balance rules are quoted back so the reasoning is the site's own.
export function adviceAnswer(text, app, history, lang = 'ru') {
  const kind = adviceKind(text, app, history);
  const topic = adviceTopic(text, kind);
  const rules = balanceRules(kind);
  const what = kind === 'race' ? 'расы' : kind === 'class' ? 'класса' : kind === 'story' ? 'сюжета' : 'персонажа';
  const head = pick(lang, `Разберём по балансу ${what}.`, `Let us look at the ${what} balance.`);

  const bodies = {
    weaken: [
      pick(lang, 'Да, ослабить стоит — если сила не уравновешена слабостью, это уже имба. Что убрать или урезать:', 'Yes, it is worth weakening — if a strength is not balanced by a weakness, it is already overpowered. What to cut:'),
      pick(lang, '— снизь урон или длительность: например, «12 урона и −3 к точности на 2 хода» вместо большего;', '— lower the damage or duration: e.g. "12 damage and −3 accuracy for 2 turns" instead of more;'),
      pick(lang, '— добавь перезарядку в ходах у сильной способности;', '— add a cooldown in turns to the strong ability;'),
      pick(lang, '— добавь вторую уязвимость, которая бьёт по сильной стороне (сухость, страх, хрупкость).', '— add a second weakness that bites the strong side (drought, fear, fragility).')
    ],
    strengthen: [
      pick(lang, 'Если наоборот слабовато — усилить можно, но так, чтобы осталось честно:', 'If it is too weak instead — you can strengthen it, but keep it fair:'),
      pick(lang, '— подними одно число (урон, длительность, запас ресурса), а не всё сразу;', '— raise one number (damage, duration, resource pool), not everything at once;'),
      pick(lang, '— дай способности вторую грань: не только урон, но и полезный эффект;', '— give the ability a second edge: not only damage but a useful effect;'),
      pick(lang, '— взамен добавь условие или слабость, чтобы не вышло имбы.', '— add a condition or weakness in exchange, so it does not become overpowered.')
    ],
    add: [
      pick(lang, 'Да, добавить есть что. Смотри, чего обычно не хватает:', 'Yes, there is room to add. What is usually missing:'),
      pick(lang, '— ещё одна слабость (среда, страх, цена силы) — это первое, что просят добавить;', '— one more weakness (environment, fear, a price for the power) — the first thing to add;'),
      pick(lang, '— общественное устройство и отношения с другими расами, если это раса;', '— a society and relations with other races, if this is a race;'),
      pick(lang, '— для класса: перезарядки в ходах, истощение ресурса и одна специализация.', '— for a class: cooldowns in turns, resource exhaustion and one specialization.')
    ],
    remove: [
      pick(lang, 'Убрать или заменить можно — если что-то дублируется или ломает баланс:', 'You can remove or replace it — if something duplicates or breaks balance:'),
      pick(lang, '— убери повтор: две способности с одним эффектом — это одна способность;', '— cut the duplicate: two abilities with the same effect are one ability;'),
      pick(lang, '— замени «бесплатную» силу на силу с ценой или перезарядкой;', '— replace a "free" power with one that has a cost or a cooldown;'),
      pick(lang, '— вместо запрета добавь ограничение: «не работает под водой» лучше, чем «нельзя».', '— instead of a ban, add a limit: "does not work underwater" beats "never allowed".')
    ],
    improve: [
      pick(lang, 'Что улучшить — по порядку:', 'What to improve, in order:'),
      pick(lang, '— сначала закрой уязвимости: без них заявку вернут;', '— close the weaknesses first: without them the sheet comes back;'),
      pick(lang, '— потом уточни числа (урон, ХП, перезарядка, ресурс);', '— then pin the numbers (damage, HP, cooldown, resource);'),
      pick(lang, '— и допиши, как это играется в сцене, а не только в цифрах.', '— and describe how it plays in a scene, not just in numbers.')
    ],
    evaluate: [
      pick(lang, 'Оцениваю честно, по правилам:', 'Honest verdict, by the rules:'),
      pick(lang, '— если у сильной способности есть слабость и перезарядка, всё в порядке;', '— if the strong ability has a weakness and a cooldown, it is fine;'),
      pick(lang, '— если сильных сторон больше, чем ограничений, — это имба, урежем;', '— if strengths outweigh limits, it is overpowered and we will trim it;'),
      pick(lang, '— если сомневаешься, добавь ещё одну слабость: лишняя слабость не мешает игре.', '— if unsure, add one more weakness: an extra weakness never hurts play.')
    ],
    problems: [
      pick(lang, 'Что не так и на что смотрят в первую очередь:', 'What is wrong and what gets checked first:'),
      pick(lang, '— нет уязвимостей или они несерьёзные;', '— no weaknesses, or they are not serious;'),
      pick(lang, '— способность без перезарядки;', '— an ability with no cooldown;'),
      pick(lang, '— бессмертие, неуязвимость или владение всеми школами магии.', '— immortality, invulnerability, or mastery of every school of magic.')
    ],
    general: [
      pick(lang, 'Отвечу по существу — опирайся на эти правила:', 'Straight answer — lean on these rules:'),
      pick(lang, '— у каждой силы должна быть цена или слабость;', '— every strength needs a cost or a weakness;'),
      pick(lang, '— числа важнее слов: урон, ХП, перезарядка, ресурс;', '— numbers matter more than words: damage, HP, cooldown, resource;'),
      pick(lang, '— не бойся слабостей: они делают персонажа живым.', '— do not fear weaknesses: they make the character alive.')
    ]
  };

  return [head, ...(bodies[topic] || bodies.general), pick(lang, 'Правила, на которые я смотрю:', 'The rules I am looking at:'), ...rules.map((r) => `— ${r}`)].join('\n');
}

// Whether the message reads like the player asking for advice rather than answering
// the current field. A question mark alone is not enough ("как зовут твоего героя?"
// is not advice), so the advice shape is required.
export function looksLikeAdvice(text) {
  return isAdviceAsk(text);
}

// The two ways to get a race or a class, said plainly. This is what the player is
// told when they ask how it works, instead of being asked for a field again.
function howToMake(lang) {
  return pick(lang,
    'Расу или класс можно сделать двумя путями. Первый — рассказываешь сам: я задаю по одному вопросу, ты отвечаешь, я собираю анкету. Второй — говоришь «придумай мне расу сам» или «придумай мне класс сам», и я придумываю всё целиком: название, внешность, способности и слабости по правилам баланса. А если раса у тебя уже готова — вставь её и скажи «сделай класс под мою расу», я соберу класс под неё. Как хочешь?',
    'You can get a race or a class two ways. First, you describe it yourself: I ask one question at a time, you answer, I build the sheet. Second, say "make a race for me" or "make a class for me" and I make the whole thing: name, look, powers and weaknesses, all balanced. And if your race is already done — paste it and say "make a class for my race", and I will build a class to match it. Which do you want?');
}

// The character interview walks the fields of the chat's own template, in order,
// and only asks for one thing at a time. That is what makes it usable without a
// model: the next question is derived from what the draft is still missing.
//
// A player does not say "add to the application" after every sentence, so the
// dialogue itself is read as an answer: whatever the last message says about a
// field counts as that field being filled. Without this the same first field was
// asked forever, because the draft never grew.
function hasFieldText(history, field) {
  const text = (Array.isArray(history) ? history : [])
    .filter((m) => m && m.role !== 'assistant')
    .map((m) => String(m.content || ''))
    .join('\n');
  if (!text.trim()) return false;
  const name = String(field || '').toLowerCase();
  // A value written as "Поле: значение" counts for that field. The lookbehind keeps
  // "Самоназвание: X" from also marking the plain "Название" field as answered.
  if (new RegExp(`(?<![а-яё])${name}\\s*[:\\-—]\\s*\\S`, 'i').test(text)) return true;
  // Some fields are recognised by what a player actually writes about them. The
  // boundaries are lookarounds rather than \b: \b is defined on [A-Za-z0-9_], so in
  // Cyrillic text it matches at the wrong places and "Меня зовут Лира" would not be
  // recognised as a name.
  const markers = {
    'имя': /(?<![а-яё])(меня зовут|мо[её] имя|зовут)/i,
    'раса': /(?<![а-яё])(эльф|гном|орк|человек|полурослик|дварф|тифлинг|демон|ангел|нежить|раса)/i,
    'класс': /(?<![а-яё])(воин|маг|лучник|некромант|чернокнижник|жрец|вор|класс|паладин)/i,
    'характер': /(характер|спокойн|вспыльчив|добр|зл|упрям|замкнут|общительн)/i,
    'внешность': /(внешност|волос|глаз|рост|одежд|шрам|татуировк)/i,
    'происхождение': /(предыстор|происхожден|родил|вырос|детств)/i,
    'хобби': /(хобби|увлека|люблю|занимаюсь|интерес)/i,
    'особенности внешности': /(особенност|шрам|татуировк|метк|крыл)/i,
    'стартовое снаряжение': /(снаряжен|оружи|брон|меч|лук|посох|кинжал|доспех)/i,
    // Race checklist. "Название" also covers "название расы" and the values written
    // as "Название: ..."; the rest match the words a player uses for each field.
    'название': /(?<![а-яё])(название|называется|самоназвание)/i,
    'самоназвание': /(самоназвание|называют себя)/i,
    'где живут': /(живут|обитают|среда обитания|местность|дом)/i,
    'чем занимаются': /(занимаются|деятельность|ремесл|работают|промысел)/i,
    'боевые навыки': /(боевые навыки|сражаются|бой|оружие|тактик)/i,
    'способности': /(способност|умени|навык)/i,
    'уязвимости': /(уязвим|слабост|недостатк|боятся)/i,
    'общественное устройство': /(правлени|законы|иерархи|социальн|общество|структур)/i,
    'магия': /(маги|школ|заклинани)/i,
    // Class checklist.
    'название класса': /(?<![а-яё])(название|называется|класс\s*[:\-—])/i,
    'роль': /(?<![а-яё])(роль|танк|саппорт|дамаг|лекарь|поддержк)/i,
    'ресурс': /(?<![а-яё])(ресурс|мана|ярость|выносливост|энерги|стрелы)/i,
    'хп': /(?<![а-яёa-z])(хп|hp|здоровь|хитпоинт)/i,
    'базовая атака': /(базовая атака|базов\w*\s*урон|обычная атака|автоатак)/i,
    'ультимейт': /(ультимейт|ульт\b)/i,
    'специализации и вехи': /(специализац|вех|эволюц|16 уровень)/i,
    'ограничения и слабости': /(ограничен|слабост|минус|недостатк)/i,
    'истощение ресурса': /(истощен|истоща|обнулен)/i
  };
  // Several markers can be substrings of one field name ("класс" sits inside
  // "Название класса"), so the most specific one decides. Without that, the word
  // "класс" anywhere in the dialogue would mark the class name as answered.
  const keys = Object.keys(markers).filter((key) => name.includes(key));
  if (!keys.length) return false;
  keys.sort((a, b) => b.length - a.length);
  return markers[keys[0]].test(text);
}

// The field the assistant last asked about, read from its own wording. The scan
// walks back to the most recent question rather than looking only at the last
// message: once the walk is over the assistant adds a "say проверь" nudge that names
// no field, and re-asking the previous field from there would restart the loop.
function lastAskedField(history, names = null) {
  const list = names || INTERVIEW_FIELDS.character;
  const msgs = Array.isArray(history) ? history : [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (!m || m.role !== 'assistant') continue;
    const found = list.find((f) => String(m.content || '').includes(`«${f}»`));
    if (found) return found;
  }
  return null;
}

// Whether the player has said anything since the assistant's last question.
function repliedSinceLastQuestion(history) {
  const msgs = Array.isArray(history) ? history : [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (!m) continue;
    if (m.role === 'assistant') return false;
    if (String(m.content || '').trim()) return true;
  }
  return false;
}

// The fields worth asking about out loud. The character template has seventeen, but
// asking a player for "Ориентация" or "Физические характеристики" one by one turns a
// chat into a form; the rest stay in the template for the player to fill in themselves.
// A plot has its own checklist, taken from the GM template's own headings. A race and
// a class have their own too: the numbered pairs of the race template are asked as one
// "Способности"/"Уязвимости" question, which is how a human reviewer would put it.
const INTERVIEW_FIELDS = {
  character: ['Имя', 'Раса', 'Класс', 'Характер', 'Внешность', 'Происхождение'],
  story: ['Название сюжета', 'Жанр', 'Завязка', 'Главная проблема', 'Антагонист', 'Локации'],
  race: ['Название', 'Самоназвание', 'Внешность', 'Где живут', 'Чем занимаются', 'Боевые навыки', 'Способности', 'Уязвимости', 'Общественное устройство', 'Магия'],
  class: ['Название класса', 'Роль', 'Ресурс', 'ХП', 'Базовая атака', 'Способности', 'Ультимейт', 'Специализации и вехи', 'Ограничения и слабости', 'Истощение ресурса']
};

const STORY_INTENT = /заявк[а-яё]*\s+на\s+сюжет|предложить\s+сюжет|придума[а-яё]*\s+сюжет|созда[а-яё]*\s+сюжет|мой\s+сюжет|сюжет\s+для\s+гм|new plot|create a plot|propose a plot|название\s+сюжета|завязка|главная\s+проблема|тэглайн|теглайн|крючок/i;
// "хочу расу", "своя раса" and the English chip all mean the same thing as the
// literal "создать расу"; matching only the verb made the chip fall through to the
// character walk, which is the bug that left races and classes impossible to make.
// The creation verb and the noun may come in either order ("создай расу" and
// "расу придумай"), so each is checked with a lookahead instead of a fixed order.
//
// The noun is matched loosely on purpose. Players type "рассу", "раса", "клас" and
// "классу" as often as the dictionary spelling, and a strict "расу" meant those
// requests fell straight through to the character walk - the interviewer answered
// "расскажи про расу" instead of building one. The `{0,3}` cap keeps the word from
// swallowing a longer lookalike: "расскажи" is too long to match, so a plain
// question about races is still a question.
const CREATION_VERB = '(?:созда|сдела|придума|сгенерир|хочу|хотел|нужн|давай|надо|мож(?:ешь|но|ем)|сам(?:а|и|о|е)?(?![а-яё]))';
const RACE_WORD = '(?<![а-яё])рас+[а-яё]{0,3}(?![а-яё])';
const CLASS_WORD = '(?<![а-яё])класс?[а-яё]{0,3}(?![а-яё])';
const RACE_INTENT = new RegExp(
  `(?=[\\s\\S]*${RACE_WORD})(?=[\\s\\S]*${CREATION_VERB})|сво[яю]\\s+${RACE_WORD}|нов[ауо][яю]\\s+${RACE_WORD}|new race|create a race|make a race|race for me`,
  'i'
);
const CLASS_INTENT = new RegExp(
  `(?=[\\s\\S]*${CLASS_WORD})(?=[\\s\\S]*${CREATION_VERB})|сво[йя]\\s+${CLASS_WORD}|нов[ауо][йя]\\s+${CLASS_WORD}|new class|create a class|make a class|class for me`,
  'i'
);
const CHARACTER_INTENT = /созда[а-яё]*\s+персонаж|хочу\s+персонаж|новый\s+персонаж|new character|create a character/i;

// A ready sheet the player pasted in (for example copied from the blog) carries the
// template's own field labels. Reading the kind from them lets a pasted race or class
// be checked against its own rules instead of being mistaken for a character sheet.
function kindFromSheetText(text) {
  const s = String(text || '').toLowerCase();
  const has = (list) => list.filter((w) => s.includes(w)).length;
  const classHits = has(['название класса', 'базовая атака', 'ультимейт', 'истощение ресурса', 'специализац', 'роль:', 'ресурс:']);
  const raceHits = has(['самоназвание', 'где живут', 'чем занимаются', 'боевые навыки', 'уязвимост', 'общественное устройство', 'форма правления', 'какой магией']);
  if (classHits >= 2) return 'class';
  if (raceHits >= 2) return 'race';
  return null;
}

// Which checklist the interview is walking. A plot, a race and a class are recognised
// by what the player asked for, and remembered in the draft so the walk continues on
// later turns. An explicit request in the newest message always wins, so a player who
// changes their mind mid-interview switches to the new checklist instead of being
// stuck on the old one.
export function interviewKind(application = {}, history = []) {
  const app = application && typeof application === 'object' ? application : {};
  const msgs = (Array.isArray(history) ? history : []).filter((m) => m && m.role !== 'assistant');
  const lastText = String(msgs[msgs.length - 1]?.content || '');
  if (CHARACTER_INTENT.test(lastText)) return 'character';
  if (RACE_INTENT.test(lastText)) return 'race';
  if (CLASS_INTENT.test(lastText)) return 'class';
  if (STORY_INTENT.test(lastText)) return 'story';
  // A pasted ready sheet wins over the remembered kind, so a player can bring an
  // already-finished race or class and have it checked on the spot. The sheet is not
  // always the newest message (the check command may follow it), so the last few
  // player messages are scanned rather than only the last one.
  const recent = msgs.slice(-4).map((m) => String(m.content || '')).join('\n');
  const fromSheet = kindFromSheetText(recent);
  if (fromSheet) return fromSheet;
  if (['race', 'class', 'story', 'character'].includes(app._kind)) return app._kind;
  const text = msgs.map((m) => String(m.content || '')).join('\n');
  if (RACE_INTENT.test(text)) return 'race';
  if (CLASS_INTENT.test(text)) return 'class';
  return STORY_INTENT.test(text) ? 'story' : 'character';
}

function interviewFields(application, history) {
  return INTERVIEW_FIELDS[interviewKind(application, history)] || INTERVIEW_FIELDS.character;
}

// What each checklist asks, in the wording a reviewer would use, plus the hint shown
// in brackets. A race and a class are asked with their own field names rather than the
// template's numbered pairs ("Уникальная способность 1"), because "Способности" is what
// a person says and what the player answers.
const FIELD_PROMPTS = {
  race: {
    'Способности': ['Способности', 'две сильные способности и в чём их сила'],
    'Уязвимости': ['Уязвимости', 'минимум две серьёзные слабости'],
    'Общественное устройство': ['Общественное устройство', 'форма правления, законы, иерархия'],
    'Магия': ['Магия', 'какими школами владеют, максимум двумя, и какими нет']
  },
  class: {
    'Название класса': ['Название класса', 'как класс называется'],
    'Способности': ['Способности', '2–3 способности на уровень, от 1 до 15, и перезарядка каждой в ходах'],
    'Ультимейт': ['Ультимейт', 'урон и эффект, один раз за сессию'],
    'Ограничения и слабости': ['Ограничения и слабости', 'минимум одно ограничение и одна слабость'],
    'Истощение ресурса': ['Истощение ресурса', 'что происходит, когда ресурс дошёл до нуля']
  }
};

function nextFieldPrompt(app, lang, history = []) {
  const fields = getKnowledge().character_template?.fields || {};
  const kind = interviewKind(app, history);
  const names = interviewFields(app, history);
  const drafted = new Set(Object.keys(app || {}));
  const covered = new Set(names.filter((f) => drafted.has(f) || hasFieldText(history, f)));
  const missing = names.filter((f) => !covered.has(f));
  const checkNudge = pick(lang, 'Если основное рассказал — скажи «проверь», и я проверю.', 'If that is the essentials — say "check" and I will review it.');
  const tellMore = pick(lang, 'Расскажи ещё что-нибудь.', 'Tell me more.');
  if (!missing.length) return [tellMore, checkNudge].join('\n');
  const next = nextMissingField(missing, fields, lang, history, kind);
  // Nothing left after the field just asked and answered: the walk is over, and
  // asking the same field again would be the loop this engine exists to avoid.
  if (!next) return [tellMore, checkNudge].join('\n');
  // Once the essentials are covered, the interview offers the check alongside the
  // next field instead of asking for one more.
  return covered.size >= interviewMinFields(kind) ? [next, checkNudge].join('\n') : next;
}

// The next field to ask about, skipping the one just asked so the same question
// never comes twice in a row. Null means the walk has nothing left to ask.
function nextMissingField(missing, fields, lang, history, kind = 'character') {
  // The checklist is passed in rather than re-detected, so a race or class walk
  // cannot drift back to the character template if the opening request scrolls out
  // of the history window.
  const names = INTERVIEW_FIELDS[kind] || INTERVIEW_FIELDS.character;
  const asked = lastAskedField(history, names);
  if (asked && repliedSinceLastQuestion(history)) {
    const idx = names.indexOf(asked);
    const after = missing.find((f) => names.indexOf(f) > idx);
    return after ? fieldPrompt(after, fields, lang, kind) : null;
  }
  return fieldPrompt(missing[0], fields, lang, kind);
}

function fieldPrompt(field, fields, lang, kind = 'character') {
  const custom = FIELD_PROMPTS[kind] && FIELD_PROMPTS[kind][field];
  if (custom) {
    return pick(lang, `Расскажи про «${custom[0]}» (${custom[1]}).`, `Tell me about "${custom[0]}" (${custom[1]}).`);
  }
  const hint = typeof fields[field] === 'string' && fields[field] ? ` (${fields[field]})` : '';
  return pick(lang, `Расскажи про «${field}»${hint}.`, `Tell me about "${field}"${hint}.`);
}

// How many essentials must be covered before a check can pass. The template has
// seventeen fields, and demanding all of them would turn the chat into a form, so
// a filled-in character is recognised by name, race and class at the least. A race
// and a class are held to more: the whole point of the balance rules is that a sheet
// names its abilities and its weaknesses, so those cannot be skipped.
const INTERVIEW_MIN_FIELDS = 3;
const KIND_MIN_FIELDS = { character: 3, story: 3, race: 4, class: 4 };

function interviewMinFields(kind) {
  return KIND_MIN_FIELDS[kind] || INTERVIEW_MIN_FIELDS;
}

// ------------------------------------------------------------- field edits

// Players revise the sheet as they go ("давай поменяем название на «лёд»",
// "переименуй расу в Морозники", "смени внешность на бледную"). Without a handler
// the request fell into the generic reaction, the bot answered "Хороший вопрос" and
// asked the next field, so the edit was silently dropped - the "он не слушает
// игрока" complaint again. This recognises the edit, names the field and the new
// value, and the caller stores it in the draft.
const EDIT_VERB = /(помен|измен|смен|замен|переимен|назов|исправ|поправ|передела|запиш)/i;

function fieldAlias(field) {
  const f = String(field || '').toLowerCase();
  if (f === 'название') return /(?<![а-яё])название(?![а-яё])/i;
  if (f === 'самоназвание') return /самоназвание/i;
  if (f === 'название класса') return /название\s+класса/i;
  if (f === 'название сюжета') return /название\s+сюжета/i;
  if (f === 'имя') return /(?<![а-яё])имя(?![а-яё])|зовут/i;
  if (f === 'внешность' || f === 'особенности внешности') return /внешност/i;
  if (f === 'где живут') return /(где\s+живут|место\s+обитан|обитан|ареал)/i;
  if (f === 'чем занимаются') return /(чем\s+занимаются|занят|деятельност|ремесл|промысел)/i;
  if (f === 'боевые навыки') return /(боев\w*\s+навык|боев)/i;
  if (f === 'способности') return /способност/i;
  if (f === 'уязвимости' || f === 'ограничения и слабости') return /(уязвим|слабост|ограничен)/i;
  if (f === 'общественное устройство') return /(общественн\w*\s+устройств|устройств|иерарх|социум)/i;
  if (f === 'магия') return /маги/i;
  if (f === 'роль') return /(?<![а-яё])роль(?![а-яё])/i;
  if (f === 'ресурс') return /ресурс/i;
  if (f === 'ультимейт') return /ультимейт|ульт(?![а-яё])/i;
  return null;
}

function implicitFieldName(kind) {
  if (kind === 'class') return 'Название класса';
  if (kind === 'story') return 'Название сюжета';
  if (kind === 'character') return 'Имя';
  return 'Название';
}

// The new value after the field name: the quoted part if there is one ("на «лёд»"),
// otherwise what follows a preposition or dash ("на Морозники", "— Морозники").
// The preposition must sit just after the field name, so an ordinary answer that
// merely mentions a place ("название, живут в горах") is not read as a new value.
function editValueAfter(text, from) {
  const rest = String(text || '').slice(Math.max(0, from), from + 140);
  const quoted = rest.match(/[«"']([^»"']{1,120})[»"']/);
  if (quoted) return quoted[1].trim();
  const after = rest.match(/(?:^|\s)(?:на|в|—|–|-|:)\s*(.+?)\s*[?.!]*$/i);
  if (after && after.index <= 24) return after[1].trim().slice(0, 120);
  return '';
}

// The field the player wants to change and the value they want, or null. Only a
// real edit verb counts, so a plain answer ("Название: Тени") is not mistaken for
// a revision.
export function parseFieldEdit(text, application = {}) {
  const s = String(text || '').trim();
  if (!s || !EDIT_VERB.test(s)) return null;
  const kind = interviewKind(application, []);
  const fields = INTERVIEW_FIELDS[kind] || INTERVIEW_FIELDS.character;
  for (const field of fields) {
    const alias = fieldAlias(field);
    if (!alias) continue;
    const m = s.match(alias);
    if (!m) continue;
    const value = editValueAfter(s, m.index + m[0].length);
    if (value) return { field, value };
  }
  // No field named but a value given ("переименуй расу в «Лёд»"): the name is meant.
  const value = editValueAfter(s, 0);
  if (value) return { field: implicitFieldName(kind), value };
  return null;
}

// Whether the sheet is complete enough to be handed to the owner. Exported so the
// caller can decide to send without re-deriving the rule, and so the decision does
// not depend on the model's wording: the site no longer judges the sheet, it only
// checks that there is something to send.
export function interviewReady(application = {}, history = []) {
  const app = application && typeof application === 'object' ? application : {};
  const kind = interviewKind(app, history);
  return countFilledFields(app, history) >= interviewMinFields(kind);
}

// The player asked for the sheet to be taken in. Exported so the sender can tell an
// explicit check from a stray "проверь" that is part of a longer sentence.
export function isCheckCommand(text) {
  return isCheckCmd(text);
}

function countFilledFields(app, history) {
  const names = interviewFields(app, history);
  const drafted = Object.keys(app || {}).filter((k) => !k.startsWith('_') && !k.startsWith('note_'));
  const covered = new Set(drafted.filter((k) => names.includes(k)));
  for (const field of names) if (hasFieldText(history, field)) covered.add(field);
  return covered.size;
}

function renderApplication(app, lang) {
  const entries = Object.entries(app || {}).filter(([k]) => !k.startsWith('note_') && !k.startsWith('_'));
  if (!entries.length) return pick(lang, 'Анкета пока пустая.', 'The application is empty so far.');
  return [pick(lang, 'Черновик анкеты:', 'Application draft:'), ...entries.map(([k, v]) => `${k}: ${v}`)].join('\n');
}

// Whether this turn is the player asking the Interviewer to author a race or a
// class itself, and if so, the finished sheet. It is checked before the checklist
// so "создай сам расу" generates instead of opening the walk. The request must name
// a race or a class ("создай сам расу"), so a bare "сделай" during a walk is left
// to the checklist and cannot throw the player's own answers away.
export function generatedSheet(history, application = {}, lang = 'ru') {
  const msgs = Array.isArray(history) ? history : [];
  const last = [...msgs].reverse().find((m) => m && m.role !== 'assistant');
  const text = String(last?.content || '');
  const hasClassWord = new RegExp(CLASS_WORD, 'i').test(text);
  const forRace = hasClassWord && isClassForRace(text);
  // The player often opens with a concept of their own ("полулюди, полунежить")
  // instead of "сделай за меня". Reading the nature words out of that message and
  // building the race from them is what stops the Interviewer from ignoring the
  // player's idea and asking for a name instead.
  const concept = raceConceptFrom(msgs);
  if (!isSelfMade(text) && !forRace && !(RACE_INTENT.test(text) && RACE_NATURE.test(text))) return null;
  const seed = seedFrom(msgs);
  // A class for an already-made race: the player names the race, so the class is
  // tied to it instead of being a free-floating kit. Checked first because such a
  // request names both a race and a class. When no race is named the request is left
  // to `localInterview`, which asks for the name rather than inventing one.
  if (forRace) {
    const race = raceNameFor(text, application, msgs);
    return /\S/.test(race) ? generateClassForRace(lang, seed, race) : null;
  }
  const wantsRace = RACE_INTENT.test(text);
  const wantsClass = CLASS_INTENT.test(text);
  if (!wantsRace && !wantsClass) return null;
  return wantsRace && !wantsClass ? generateRace(lang, seed, concept) : generateClass(lang, seed);
}

// The player's own idea for a race, pulled from the dialogue. The opening request
// names the nature ("полу люди, полу нежить", "ледяные, что живут в горах"), so it
// is preferred; a bare "хочу расу" carries no nature and returns nothing, which
// keeps the plain request opening the walk instead of inventing a race for it.
function raceConceptFrom(history) {
  const msgs = (Array.isArray(history) ? history : []).filter((m) => m && m.role !== 'assistant');
  for (let i = msgs.length - 1; i >= 0; i--) {
    const text = String(msgs[i].content || '').trim();
    if (!text) continue;
    if (isCheckCmd(text) || isShowCmd(text) || isAddCmd(text) || isEndCommand(text)) continue;
    if (RACE_INTENT.test(text) && RACE_NATURE.test(text)) return text;
  }
  return '';
}

// "Класс под готовую расу X", "сделай класс для расы X", "класс по расе X". A class
// requested together with a race is a different request from a free-standing class.
export function isClassForRace(text) {
  const s = String(text || '');
  return /класс[а-яё]{0,3}\s*(?:,?\s*(?:котор[а-яё]+|что)\s*)?(?:подход[а-яё]*|подходящ[а-яё]*|под\b|для\b|по\b|под\s+готов)/i.test(s) && /рас[а-яё]{0,3}/i.test(s)
    || /класс[а-яё]{0,3}\s*(?:под|для|по)\s*(?:(?:готов[а-яё]*|мою|свою|эту|ту|моей|своей)\s+)?рас/i.test(s)
    || /рас[а-яё]{0,3}\s*(?:под|для)\s*класс/i.test(s)
    || /класс[а-яё]{0,3}[\s\S]{0,40}рас[а-яё]{0,3}/i.test(s) && /подход|подходящ|совместим|соответств/i.test(s)
    || /class\s+(?:for|to|that\s+fits?|matching)\s+(?:the\s+|my\s+|a\s+)?race/i.test(s);
}

// A class-for-race request that names no race ("сделай класс под мою расу",
// "может ли ии сделать класс для расы игрока"). The engine cannot invent the race,
// so it asks for the name instead of building a free-floating class that ignores it.
export function isClassForRaceAsk(text) {
  const s = String(text || '');
  if (!isClassForRace(s)) return false;
  return !/\S/.test(raceNameFor(s, {}, []) || '');
}

// The race the class is built for. The newest message wins, then a ready race the
// player pasted in (the "Название" line of a race sheet), then the draft the race
// interview left behind, then any race named in the dialogue.
// Words that follow "расы/раса" in ordinary speech but are not a race name
// ("класс для расы игрока", "под мою расу"). Without this the history fallback read
// "игрока" as the race name, so "сделай класс для расы игрока" was taken as a
// named race and the interviewer invented a class instead of asking which race.
const NOT_A_RACE_NAME = /^(игрок|игрока|игроку|игроком|персонаж|персонажа|герой|героя|свою|мою|нашу|эту|ту|готовую|новую|любую|расу|расы|раса|расе|класс|класса|классу)$/i;

function cleanRaceName(value) {
  const name = String(value || '').trim().split(/[.\n]/)[0].slice(0, 60).trim();
  return NOT_A_RACE_NAME.test(name) ? '' : name;
}

export function raceNameFor(text, application = {}, history = []) {
  const app = application && typeof application === 'object' ? application : {};
  const quoted = String(text || '').match(/[«"']([^»"']{2,60})[»"']/);
  if (quoted) return cleanRaceName(quoted[1]);
  // A pasted race sheet carries its own "Название: X" line. The lookbehind keeps
  // "Самоназвание: X" from being read as the race name.
  const labelled = String(text || '').match(/(?<![а-яё])(?:название\s+расы|название)\s*[:\-—]\s*(.+)/i);
  if (labelled) return cleanRaceName(labelled[1]);
  const named = String(text || '').match(/(?<![а-яё])(?:расу|расы|раса|расе|race)\s+[«"']?([A-ZА-ЯЁ][\wа-яё\- ]{1,40})/);
  if (named) return cleanRaceName(named[1]);
  for (const key of ['Название', 'Название расы']) {
    if (typeof app[key] === 'string' && app[key].trim()) return cleanRaceName(app[key]);
  }
  const msgs = Array.isArray(history) ? history : [];
  const joined = msgs.filter((m) => m && m.role !== 'assistant')
    .map((m) => String(m.content || '')).join('\n');
  const labelledHist = joined.match(/(?<![а-яё])[Нн]азвание(?:\s+расы)?\s*[:\-—]\s*(.+)/);
  if (labelledHist) return cleanRaceName(labelledHist[1]);
  // No `/i` here: an upper-case first letter is what tells a name from "расы игрока".
  const namedHist = joined.match(/(?<![а-яё])(?:расу|расы|раса|расе)\s+[«"']?([A-ZА-ЯЁ][\wа-яё\- ]{1,40})/);
  return namedHist ? cleanRaceName(namedHist[1]) : '';
}

export function localInterview({ messages = [], lang = 'ru', application = {} } = {}) {
  const history = Array.isArray(messages) ? messages : [];
  const app = application && typeof application === 'object' ? application : {};
  const last = [...history].reverse().find((m) => m.role !== 'assistant');
  const text = String(last?.content || '');

  if (isAddCmd(text)) {
    const note = text.replace(/добавь в анкету/gi, '').replace(/add to the application/gi, '').trim();
    return [
      pick(lang, `Добавил в анкету: ${note || '(пусто)'}.`, `Added to the application: ${note || '(empty)'}.`),
      nextFieldPrompt(app, lang, history)
    ].join('\n');
  }
  if (isShowCmd(text)) return renderApplication(app, lang);
  if (isCheckCmd(text)) {
    // The site does not judge the sheet any more: it accepts it and hands it to the
    // owner, who decides. So a check either reports that the sheet is not ready, or
    // accepts it. The fixed "передана владельцу" closing line is added by the caller.
    const kind = interviewKind(app, history);
    const filled = countFilledFields(app, history);
    if (filled < interviewMinFields(kind)) {
      return [
        pick(lang, 'Анкета ещё не заполнена: мне нужно больше деталей, иначе отправлять нечего.', 'The application is not filled in yet: I need more detail before sending it.'),
        nextFieldPrompt(app, lang, history)
      ].join('\n');
    }
    return pick(lang, 'Принял заявку — передаю её владельцу.', 'Accepted — passing it to the owner.');
  }
  // The player asks the Interviewer to author the sheet itself ("создай сам",
  // "придумай за меня"). It builds a complete race or class from the balance rules
  // and hands back the draft, so the very next "проверь" accepts and forwards it.
  const made = generatedSheet(history, app, lang);
  if (made) return renderGenerated(made, lang);
  // The player hands the rest over mid-walk ("Можешь сам всё дальше придумать?").
  // The generated sheet keeps the fields they already filled and only fills the
  // blanks, instead of answering with a question and offering the same handover back.
  const finished = finishSheet(history, app, lang);
  if (finished) return renderGenerated(finished, lang);
  const wantsRace = RACE_INTENT.test(text);
  const wantsClass = CLASS_INTENT.test(text);
  // A class requested for a race that has not been named yet ("может ли ии сделать
  // класс для расы игрока?", "сделай класс под мою расу"). The engine cannot invent
  // the race, so it asks which one instead of building a class that ignores it.
  if (isClassForRaceAsk(text)) {
    return [
      pick(lang, 'Конечно, могу — но сначала назови расу, под которую нужен класс: под её природу, способности и слабости я соберу подходящий класс.', 'Of course I can — but first name the race the class is for: I will build it around that race\'s nature, abilities and weaknesses.'),
      nextFieldPrompt({ ...app, _kind: 'class' }, lang, history)
    ].join('\n');
  }
  // "Как мне создать расу?" is a how-to, not advice about a sheet: the two options
  // are explained, then the walk continues. Checked before the advice block so the
  // word "подскажи" in a how-to question cannot turn it into balance advice.
  const createHelp = /как\s+(мне\s+)?(создать|сделать|придумать|заполнить|начать|играть|быть)|с\s+чего\s+начать|what\s+(do|should)\s+i|how\s+(do|can)\s+i/i.test(text);
  if (createHelp) {
    const kind = wantsRace ? 'race' : wantsClass ? 'class' : interviewKind(app, history);
    return [howToMake(lang), nextFieldPrompt({ ...app, _kind: kind }, lang, history)].join('\n');
  }
  // A stated requirement the sheet must meet ("до 15 уровня — максимум 2–3 хода",
  // "перезарядка должна быть не везде") is acknowledged here, before the generic
  // advice dump, so it cannot be swallowed by a "может быть" inside the same message.
  const rule = ruleRequirement(text, lang);
  if (rule) return [rule, nextFieldPrompt(app, lang, history)].join('\n');
  // The player is thinking out loud about the sheet ("может, ослабить его
  // способности?", "может, добавить что-нибудь?"). There are too many phrasings to
  // list, so the shape of the question is recognised and answered from the balance
  // rules, and then the walk continues from where it was. A plain creation request
  // ("может, сделать расу?") is handled above, so it is not swallowed here.
  if (isAdviceAsk(text)) {
    return [adviceAnswer(text, app, history, lang), nextFieldPrompt(app, lang, history)].join('\n');
  }
  if (isHelpAsk(text)) {
    const kind = wantsRace ? 'race' : wantsClass ? 'class' : interviewKind(app, history);
    return [howToMake(lang), nextFieldPrompt({ ...app, _kind: kind }, lang, history)].join('\n');
  }
  if (wantsRace) {
    // The player may open with a concept of their own ("полу люди, полу нежить").
    // When the message carries the race's nature, the race is built from it right
    // away instead of being met with a form that ignores the idea.
    const concept = raceConceptFrom(history);
    if (concept) return renderGenerated(generateRace(lang, seedFrom(history), concept), lang);
    const rules = (getKnowledge().races?.race_template_rules || []).map((r) => `— ${r}`).join('\n');
    return [
      pick(lang, 'Давай сделаем расу. Правила:', 'Let us make a race. Rules:'),
      rules,
      pick(lang, 'Отвечай по пунктам, и я соберу анкету расы. Когда закончим — скажи «проверь».', 'Answer point by point and I will build the race sheet. When we are done — say "check".'),
      pick(lang, 'Или опиши идею одной фразой — и я соберу расу сам.', 'Or describe the idea in one line and I will build the race myself.'),
      nextFieldPrompt({ ...app, _kind: 'race' }, lang, history)
    ].join('\n');
  }
  if (wantsClass) {
    const rules = (getKnowledge().classes?.class_balance_rules || []).map((r) => `— ${r}`).join('\n');
    return [
      pick(lang, 'Давай сделаем класс. Правила баланса:', 'Let us make a class. Balance rules:'),
      rules,
      pick(lang, 'Отвечай по пунктам, и я соберу анкету класса. Когда закончим — скажи «проверь».', 'Answer point by point and I will build the class sheet. When we are done — say "check".'),
      nextFieldPrompt({ ...app, _kind: 'class' }, lang, history)
    ].join('\n');
  }
  if (isGreeting(text) || !text.trim()) {
    return pick(lang,
      'Привет. Я Регистратор Deeprealm. Расскажи о персонаже: имя, раса, класс, характер, сильные и слабые стороны. Хочешь создать расу, класс или предложить сюжет для ГМ — просто скажи. Скажи «добавь в анкету», чтобы сохранить детали.',
      'Hi. I am the Deeprealm Registrar. Tell me about your character: name, race, class, character, strengths and weaknesses. To make a race, a class or to propose a plot for the game master, just say so. Say "add to the application" to save details.');
  }
  // The player revises the sheet ("давай поменяем название на «лёд»"). This is
  // checked before the generic reaction, so the change is stored and confirmed
  // instead of being answered with "Хороший вопрос" and dropped.
  const edit = parseFieldEdit(text, app);
  if (edit) {
    const note = pick(lang,
      `Записал: ${edit.field} → «${edit.value}».`,
      `Noted: ${edit.field} → "${edit.value}".`);
    const kind = interviewKind(app, history);
    return [note, nextFieldPrompt({ ...app, _kind: kind }, lang, history)].join('\n');
  }
  // Otherwise react to what was just said, then ask for the next thing. The
  // reaction is what makes the walk feel like a conversation instead of a form.
  const question = nextFieldPrompt(app, lang, history);
  const reaction = interviewerReaction(text, lang);
  // Once a couple of things are on the sheet, the interviewer offers to finish the
  // rest itself. That is what turns "it only asks me questions" into a two-way
  // conversation: the player can hand the work over at any point, not only at the
  // very start with a magic phrase.
  const kind = interviewKind(app, history);
  const offer = (kind === 'race' || kind === 'class') && countFilledFields(app, history) >= 2
    ? pick(lang, `Хочешь, придумаю остальное за тебя — скажи «придумай мне ${kind === 'race' ? 'расу' : 'класс'} сам».`, `Want me to make the rest for you? Say "make a ${kind} for me".`)
    : '';
  return [reaction, question, offer].filter(Boolean).join('\n');
}

// -------------------------------------------------------------------- staff

// A short, warm reaction to whatever the candidate just wrote, so the interview
// reads as a conversation rather than a form. The next question itself is fixed
// by staffTurn, which keeps the branch script intact without a model.
function staffReaction(text, lang) {
  const s = String(text || '').trim();
  if (!s) return pick(lang, 'Понял.', 'Got it.');
  if (s.length < 12) return pick(lang, 'Коротко, но ясно.', 'Short but clear.');
  if (/не\s+знаю|не\s+уверен|затрудня/i.test(s)) return pick(lang, 'Ничего, разберёмся.', 'No worries, we will figure it out.');
  return pick(lang, 'Хорошо, спасибо за ответ.', 'Good, thanks for the answer.');
}

export function localStaff({ messages = [], lang = 'ru', application = {} } = {}) {
  const history = Array.isArray(messages) ? messages : [];
  const app = application && typeof application === 'object' ? application : {};
  const turn = staffTurn(history, app, lang);
  const last = [...history].reverse().find((m) => m.role !== 'assistant');
  const text = String(last?.content || '');

  // A clarifying question is answered from the stored norms, then the same
  // scripted question is asked again - the candidate must not lose a step.
  if (turn.askingQuestion) {
    const faq = matchActivityFaq(text);
    const answer = faq ? faq.a : pick(lang, 'Это зависит от направления — расскажу, как выберешь.', 'That depends on the branch — I will explain once you pick one.');
    return [answer, turn.question].filter(Boolean).join('\n');
  }
  if (!turn.role) return turn.question;
  if (turn.done) {
    return [
      pick(lang, 'Спасибо за ответы. Сильные стороны вижу, серьёзных сомнений нет.', 'Thanks for the answers. I see strong points and have no serious doubts.'),
      finaleText('staff', lang, { approved: true })
    ].join('\n');
  }
  return [staffReaction(text, lang), turn.question].join('\n');
}
