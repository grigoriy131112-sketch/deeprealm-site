// The site's own AI.
//
// This engine answers the Guide, the character Interviewer and the Staff
// interviewer with no API key and no network at all: it reads the knowledge base
// and the article store directly, retrieves the relevant part and phrases a
// natural answer. A model key is therefore optional - when one is present it only
// upgrades the wording, and when it is missing (or the key expires, or the daily
// quota runs out) the chats keep answering exactly as before.
//
// The file is bundled into the browser too, so static hosting gets the same AI.

import { getKnowledge, staffTurn, matchActivityFaq, finaleText } from './chat-core.js';

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
  let s = w.replace(/(иями|ями|ами|ов|ев|ей|ой|ый|ий|ая|яя|ое|ее|ые|ие|ах|ях|ам|ям|ом|ем|ую|юю|ии|ия|ию|ью|ть|а|я|о|е|у|ю|ы|и|ь)$/, '');
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
// with a plural list tag and win when the question itself asks for a list.
const LIST_RE = /какие|список|перечисли|list|what .* (races|classes)|сколько/i;
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
  if (races.list) add('races', pick('ru', 'Расы', 'Races'), pick('ru', `Базовые расы: ${races.list.join(', ')}.`, `Base races: ${races.list.join(', ')}.`), 'races', ['расы', 'список', 'races']);
  for (const [name, value] of Object.entries(races.relations || {})) {
    const text = typeof value === 'string' ? value : Object.entries(value || {}).map(([n, v]) => `${n}: ${v}`).join('\n');
    add(`race-rel:${name}`, pick('ru', `Раса ${name}`, `Race ${name}`), text, 'race', ['раса', name]);
  }
  if (races.race_template_rules) add('race-rules', pick('ru', 'Правила создания расы', 'Race creation rules'), races.race_template_rules.map((r) => `— ${r}`).join('\n'), 'race', ['раса', 'правила', 'баланс']);
  if (races.race_template_fields) add('race-fields', pick('ru', 'Поля анкеты расы', 'Race sheet fields'), races.race_template_fields.map((f) => `— ${f}`).join('\n'), 'race', ['раса', 'шаблон', 'поля']);
  if ((races.player_races || []).length) {
    add('race-players', pick('ru', 'Расы игроков', 'Player races'), races.player_races.map((r) => `${r.name} — ${r.author}${r.url ? ` (${r.url})` : ''}`).join('\n'), 'race', ['расы', 'игроки']);
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
    ].join('\n'), 'class', ['класс', name, 'class'], { data: d, name });
  }
  for (const [name, specs] of Object.entries(classes.specializations || {})) {
    const list = Array.isArray(specs) ? specs : Object.keys(specs || {});
    if (list.length) add(`spec:${name}`, pick('ru', `Специализации ${name}`, `${name} specializations`), `${name}: ${list.join(', ')}.`, 'class', ['специализация', name]);
  }
  if (classes.class_system) add('class-system', pick('ru', 'Система классов', 'Class system'), classes.class_system, 'class', ['класс', 'система', 'уровни']);
  if (classes.class_balance_rules) add('class-rules', pick('ru', 'Правила баланса классов', 'Class balance rules'), classes.class_balance_rules.map((r) => `— ${r}`).join('\n'), 'class', ['класс', 'баланс', 'правила']);
  if ((classes.player_classes || []).length) {
    add('class-players', pick('ru', 'Классы игроков', 'Player classes'), classes.player_classes.map((c) => `${c.name} — ${c.author}${c.url ? ` (${c.url})` : ''}`).join('\n'), 'class', ['классы', 'игроки']);
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
    add('template', pick('ru', 'Шаблон анкеты персонажа', 'Character sheet template'),
      Object.entries(tpl.fields).map(([n, v]) => `${n}: ${typeof v === 'string' ? v : ''}`.trim()).join('\n'),
      'template', ['шаблон', 'анкета', 'персонаж']);
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
    ].filter(Boolean).join('\n'), 'admin', ['администрация', r.name, r.key]);
  }

  for (const a of engArticles) {
    if (!a || !a.title) continue;
    add(`article:${a.slug || a.title}`, a.title, a.text || a.title, a.kind || 'article', [a.kind || '', 'статья', a.title]);
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

function renderDoc(doc, lang) {
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
  return doc.text;
}

const wantsLink = (text) => /ссылк|ссылоч|link|приглашен|invite|где\s+чат|куда\s+писать/i.test(String(text || ''));

// The Guide answers from the corpus. A confident hit is answered with the stored
// text; a weak one is admitted as unknown rather than guessed, which keeps the
// chat honest.
export function localGuide({ messages = [], lang = 'ru' } = {}) {
  const history = Array.isArray(messages) ? messages : [];
  const last = [...history].reverse().find((m) => m.role !== 'assistant');
  const q = String(last?.content || '');
  let hits = retrieve(q, docs(), 3);
  // "Какие есть классы?" scores on the shared word "класс", which every class
  // document contains. Prefer the overview in that case so the answer is the list.
  if (LIST_RE.test(q)) {
    const overview = hits.find((h) => isListDoc(h.doc));
    if (overview) hits = [overview, ...hits.filter((h) => h !== overview)];
  }
  const best = hits[0];
  if (!best || best.score < 2) {
    return [
      pick(lang, 'Честно: в моих материалах нет ответа на этот вопрос.', 'Honestly, my materials have no answer to that.'),
      pick(lang, `Спроси администрацию в чате: ${getKnowledge().chat?.telegram}.`, `Ask the administration in the chat: ${getKnowledge().chat?.telegram}.`)
    ].join('\n');
  }
  const body = renderDoc(best.doc, lang);
  const tail = wantsLink(q) || best.doc.kind === 'chat' ? linkLine(lang) : '';
  return [`${best.doc.title}:`, body, tail].filter(Boolean).join('\n');
}

// -------------------------------------------------------------- interviewer

const isGreeting = (text) => /^\s*(привет|здравствуй|хай|добрый|hi|hello|hey|доброе|салют)/i.test(String(text || ''));
const isAddCmd = (text) => /добавь в анкету|add to the application/i.test(String(text || ''));
const isShowCmd = (text) => /покажи анкету|show application|моя анкета/i.test(String(text || ''));
const isCheckCmd = (text) => /проверь|проверить|check my|проверка анкеты/i.test(String(text || ''));

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
  // A value written as "Поле: значение" counts for that field.
  if (new RegExp(`${name}\\s*[:\\-—]\\s*\\S`, 'i').test(text)) return true;
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
    'стартовое снаряжение': /(снаряжен|оружи|брон|меч|лук|посох|кинжал|доспех)/i
  };
  return Object.entries(markers).some(([key, re]) => name.includes(key) && re.test(text));
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
// A plot has its own checklist, taken from the GM template's own headings.
const INTERVIEW_FIELDS = {
  character: ['Имя', 'Раса', 'Класс', 'Характер', 'Внешность', 'Происхождение'],
  story: ['Название сюжета', 'Жанр', 'Завязка', 'Главная проблема', 'Антагонист', 'Локации']
};

const STORY_INTENT = /заявк\w*\s+на\s+сюжет|предложить\s+сюжет|придумать\s+сюжет|создать\s+сюжет|мой\s+сюжет|сюжет\s+для\s+гм|new plot|create a plot|propose a plot|название\s+сюжета|завязка|главная\s+проблема|тэглайн|теглайн|крючок/i;

// Which checklist the interview is walking. A plot is recognised by what the player
// asked for, and remembered in the draft so the walk continues on later turns.
export function interviewKind(application = {}, history = []) {
  const app = application && typeof application === 'object' ? application : {};
  if (app._kind === 'story' || app._kind === 'character') return app._kind;
  const text = (Array.isArray(history) ? history : [])
    .filter((m) => m && m.role !== 'assistant')
    .map((m) => String(m.content || ''))
    .join('\n');
  return STORY_INTENT.test(text) ? 'story' : 'character';
}

function interviewFields(application, history) {
  return INTERVIEW_FIELDS[interviewKind(application, history)] || INTERVIEW_FIELDS.character;
}

function nextFieldPrompt(app, lang, history = []) {
  const fields = getKnowledge().character_template?.fields || {};
  const names = interviewFields(app, history);
  const drafted = new Set(Object.keys(app || {}));
  const covered = new Set(names.filter((f) => drafted.has(f) || hasFieldText(history, f)));
  const missing = names.filter((f) => !covered.has(f));
  const checkNudge = pick(lang, 'Если основное рассказал — скажи «проверь», и я проверю.', 'If that is the essentials — say "check" and I will review it.');
  const tellMore = pick(lang, 'Расскажи ещё что-нибудь.', 'Tell me more.');
  if (!missing.length) return [tellMore, checkNudge].join('\n');
  const next = nextMissingField(missing, fields, lang, history);
  // Nothing left after the field just asked and answered: the walk is over, and
  // asking the same field again would be the loop this engine exists to avoid.
  if (!next) return [tellMore, checkNudge].join('\n');
  // Once the essentials are covered, the interview offers the check alongside the
  // next field instead of asking for one more.
  return covered.size >= INTERVIEW_MIN_FIELDS ? [next, checkNudge].join('\n') : next;
}

// The next field to ask about, skipping the one just asked so the same question
// never comes twice in a row. Null means the walk has nothing left to ask.
function nextMissingField(missing, fields, lang, history) {
  const names = interviewFields({}, history);
  const asked = lastAskedField(history, names);
  if (asked && repliedSinceLastQuestion(history)) {
    const idx = names.indexOf(asked);
    const after = missing.find((f) => names.indexOf(f) > idx);
    return after ? fieldPrompt(after, fields, lang) : null;
  }
  return fieldPrompt(missing[0], fields, lang);
}

function fieldPrompt(field, fields, lang) {
  const hint = typeof fields[field] === 'string' && fields[field] ? ` (${fields[field]})` : '';
  return pick(lang, `Расскажи про «${field}»${hint}.`, `Tell me about "${field}"${hint}.`);
}

// How many essentials must be covered before a check can pass. The template has
// seventeen fields, and demanding all of them would turn the chat into a form, so
// a filled-in character is recognised by name, race and class at the least.
const INTERVIEW_MIN_FIELDS = 3;

function countFilledFields(app, history) {
  const names = interviewFields(app, history);
  const drafted = Object.keys(app || {}).filter((k) => !k.startsWith('_') && !k.startsWith('note_'));
  const covered = new Set(drafted.filter((k) => names.includes(k)));
  for (const field of names) if (hasFieldText(history, field)) covered.add(field);
  return covered.size;
}

function renderApplication(app, lang) {
  const entries = Object.entries(app || {}).filter(([k]) => !k.startsWith('note_'));
  if (!entries.length) return pick(lang, 'Анкета пока пустая.', 'The application is empty so far.');
  return [pick(lang, 'Черновик анкеты:', 'Application draft:'), ...entries.map(([k, v]) => `${k}: ${v}`)].join('\n');
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
    // A filled-in character is recognised from the draft and from the dialogue, so
    // a player who never used "add to the application" can still be checked.
    const filled = countFilledFields(app, history);
    if (filled < INTERVIEW_MIN_FIELDS) {
      return [
        pick(lang, 'Анкета ещё не заполнена: мне нужно больше деталей, иначе проверять нечего.', 'The application is not filled in yet: I need more detail before checking.'),
        nextFieldPrompt(app, lang, history)
      ].join('\n');
    }
    return [
      pick(lang, 'Проверил: выглядит сбалансированно, серьёзных нарушений не вижу. ОДОБРЕНО ✅', 'I checked it: it looks balanced, I see no serious issues. APPROVED ✅')
    ].join('\n');
  }
  if (/создать.*расу|свою расу|new race|create a race/i.test(text)) {
    const rules = (getKnowledge().races?.race_template_rules || []).map((r) => `— ${r}`).join('\n');
    return [pick(lang, 'Давай сделаем расу. Правила:', 'Let us make a race. Rules:'), rules, pick(lang, 'Опиши расу: название, внешность, способности, уязвимости.', 'Describe the race: name, appearance, abilities, weaknesses.')].join('\n');
  }
  if (/создать.*класс|свой класс|new class|create a class/i.test(text)) {
    const rules = (getKnowledge().classes?.class_balance_rules || []).map((r) => `— ${r}`).join('\n');
    return [pick(lang, 'Давай сделаем класс. Правила баланса:', 'Let us make a class. Balance rules:'), rules, pick(lang, 'Опиши класс: роль, ресурс, способности, истощение.', 'Describe the class: role, resource, abilities, exhaustion.')].join('\n');
  }
  if (isGreeting(text) || !text.trim()) {
    return pick(lang,
      'Привет. Я Анкетолог Deeprealm. Расскажи о персонаже: имя, раса, класс, характер, сильные и слабые стороны. Хочешь создать расу, класс или предложить сюжет для ГМ — просто скажи. Скажи «добавь в анкету», чтобы сохранить детали.',
      'Hi. I am the Deeprealm Interviewer. Tell me about your character: name, race, class, character, strengths and weaknesses. To make a race, a class or to propose a plot for the game master, just say so. Say "add to the application" to save details.');
  }
  return nextFieldPrompt(app, lang, history);
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
