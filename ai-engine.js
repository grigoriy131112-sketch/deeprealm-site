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

import { getKnowledge, staffTurn, matchActivityFaq, finaleText } from './chat-core.js';
import { generateRace, generateClass, seedFrom, renderGenerated } from './ai-gen.js';

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
// "Сделай сам" — the player asks the Interviewer to author the sheet instead of
// answering the checklist. This is a distinct request from "хочу расу": the latter
// opens the walk, this one asks the interviewer to do the work. "Я сам" is the
// opposite — the player wants to write it — so it is excluded.
function isSelfMade(text) {
  const s = String(text || '');
  if (/(?<![а-яё])я\s+сам/i.test(s)) return false;
  return /(?<![а-яё])сам(а|и|о|е|ому|ой|ого|им|их)?(?![а-яё])|за\s+меня|для\s+меня|мне\s+сам|придума(й|йте|ть)|(?<![а-яё])сделай|(?<![а-яё])создай|сгенерируй|на\s+свой\s+вкус|на\s+тво[её]\s+усмотрение|твой\s+вариант|yourself|for me|make it|create it/i.test(s);
}

// A player who asks how any of this works should get an answer, not another field
// question. Recognising the help request is what makes the chat feel like a
// conversation: "а как создать расу?" is answered, then the walk continues.
function isHelpAsk(text) {
  const s = String(text || '');
  return /как\s+(мне\s+)?(создать|сделать|придумать|заполнить|начать|играть|быть)|что\s+(мне\s+)?(писать|нужно|делать|дальше|заполнять)|помоги|подскажи|объясни|не\s+знаю|не\s+понимаю|запутался|с\s+чего\s+начать|how\s+(do|can)\s+i|what\s+(do|should)\s+i|help me/i.test(s);
}

// A short, human reaction to the last message, so a turn reads as a reply rather
// than a form field. It carries no «...» of its own, so the field question after it
// stays the only question in the reply.
function interviewerReaction(text, lang) {
  const s = String(text || '').trim();
  if (!s) return '';
  if (/\?\s*$/.test(s)) return pick(lang, 'Хороший вопрос.', 'Good question.');
  if (/не\s+знаю|не\s+уверен|затрудня|не\s+понимаю/i.test(s)) return pick(lang, 'Ничего, помогу разобраться.', 'No worries, I will help you figure it out.');
  if (s.length < 12) return pick(lang, 'Коротко и ясно.', 'Short and clear.');
  if (s.length >= 40) return pick(lang, 'Отлично, вот это уже деталь.', 'Nice, that is a real detail.');
  return pick(lang, 'Записал.', 'Noted.');
}

// The two ways to get a race or a class, said plainly. This is what the player is
// told when they ask how it works, instead of being asked for a field again.
function howToMake(lang) {
  return pick(lang,
    'Расу или класс можно сделать двумя путями. Первый — рассказываешь сам: я задаю по одному вопросу, ты отвечаешь, я собираю анкету. Второй — говоришь «придумай мне расу сам» или «придумай мне класс сам», и я придумываю всё целиком: название, внешность, способности и слабости по правилам баланса. Как хочешь?',
    'You can get a race or a class two ways. First, you describe it yourself: I ask one question at a time, you answer, I build the sheet. Second, say "make a race for me" or "make a class for me" and I make the whole thing: name, look, powers and weaknesses, all balanced. Which do you want?');
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
  class: ['Название класса', 'Роль', 'Ресурс', 'ХП', 'Базовая атака', 'Способности', 'Ультимейт', 'Ограничения и слабости', 'Истощение ресурса']
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
  if (!isSelfMade(text)) return null;
  const wantsRace = RACE_INTENT.test(text);
  const wantsClass = CLASS_INTENT.test(text);
  if (!wantsRace && !wantsClass) return null;
  const seed = seedFrom(msgs);
  return wantsRace ? generateRace(lang, seed) : generateClass(lang, seed);
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
    // A filled-in sheet is recognised from the draft and from the dialogue, so a
    // player who never used "add to the application" can still be checked. A race
    // and a class must carry their abilities and weaknesses, which is what the
    // balance rules are about, so they need more covered fields than a character.
    const kind = interviewKind(app, history);
    const filled = countFilledFields(app, history);
    if (filled < interviewMinFields(kind)) {
      return [
        pick(lang, 'Анкета ещё не заполнена: мне нужно больше деталей, иначе проверять нечего.', 'The application is not filled in yet: I need more detail before checking.'),
        nextFieldPrompt(app, lang, history)
      ].join('\n');
    }
    const approved = pick(lang, 'Проверил: выглядит сбалансированно, серьёзных нарушений не вижу. ОДОБРЕНО ✅', 'I checked it: it looks balanced, I see no serious issues. APPROVED ✅');
    return approved;
  }
  // The player asks the Interviewer to author the sheet itself ("создай сам",
  // "придумай за меня"). It builds a complete race or class from the balance rules
  // and hands back the draft, so the very next "проверь" approves and forwards it.
  const made = generatedSheet(history, app, lang);
  if (made) return renderGenerated(made, lang);
  const wantsRace = RACE_INTENT.test(text);
  const wantsClass = CLASS_INTENT.test(text);
  // A question about how this works is explained instead of opening the walk, so
  // "а как мне создать расу?" gets the two options and then the first question.
  if (isHelpAsk(text)) {
    const kind = wantsRace ? 'race' : wantsClass ? 'class' : interviewKind(app, history);
    return [howToMake(lang), nextFieldPrompt({ ...app, _kind: kind }, lang, history)].join('\n');
  }
  if (wantsRace) {
    const rules = (getKnowledge().races?.race_template_rules || []).map((r) => `— ${r}`).join('\n');
    return [
      pick(lang, 'Давай сделаем расу. Правила:', 'Let us make a race. Rules:'),
      rules,
      pick(lang, 'Отвечай по пунктам, и я соберу анкету расы. Когда закончим — скажи «проверь».', 'Answer point by point and I will build the race sheet. When we are done — say "check".'),
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
      'Привет. Я Анкетолог Deeprealm. Расскажи о персонаже: имя, раса, класс, характер, сильные и слабые стороны. Хочешь создать расу, класс или предложить сюжет для ГМ — просто скажи. Скажи «добавь в анкету», чтобы сохранить детали.',
      'Hi. I am the Deeprealm Interviewer. Tell me about your character: name, race, class, character, strengths and weaknesses. To make a race, a class or to propose a plot for the game master, just say so. Say "add to the application" to save details.');
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
