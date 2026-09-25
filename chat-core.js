// The chat logic shared by the Node server and the browser.
//
// The same rules, prompts and scripted turns must produce the same replies
// wherever they run. Keeping one copy here means the static site can answer
// without a server, and the server cannot drift from it.
//
// The knowledge base is injected with setKnowledge() instead of being read from
// disk, because the browser has no file system.

let knowledge = {};
export function setKnowledge(next) { knowledge = next || {}; }

// Deciding whether a sheet is a race or a class needs the article builder, which
// only exists on the server. The browser registers a lighter check instead of
// importing it, so approval still works with no server present.
let sheetDetector = () => null;
export function setSheetDetector(fn) { sheetDetector = typeof fn === "function" ? fn : () => null; }
export function getKnowledge() { return knowledge; }

// Compact, structured context injected into every model prompt.
export function buildKnowledgeContext(lang) {
  return [
    `ЧАТ: ${knowledge.chat.name}. ${knowledge.chat.tagline}. Telegram: ${knowledge.chat.telegram}`,
    `ВЛАДЕЛЕЦ: ${knowledge.chat.owner}. Связь: ${knowledge.chat.contact || ''}`,
    knowledge.chat.administration ? `АДМИНИСТРАЦИЯ (состав и роли): ${knowledge.chat.administration}` : '',
    'ПРАВИЛА:',
    ...Object.entries(knowledge.rules).flatMap(([section, items]) => [`— ${section}`, ...items.map((i) => `  • ${i}`)]),
    'ЛОР:',
    ...Object.entries(knowledge.lore).map(([k, v]) => `— ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`),
    'РАСЫ (базовые): ' + knowledge.races.list.join(', '),
    'ССЫЛКИ НА РАСЫ: ' + Object.entries(knowledge.races.links || {}).map(([n, v]) => `${n}: ${v}`).join('; '),
    'ПРАВИЛА СОЗДАНИЯ РАС: ' + knowledge.races.race_template_rules.join(' '),
    knowledge.races.blog_link ? 'СТАТЬЯ ПРО РАСЫ: ' + knowledge.races.blog_link : '',
    knowledge.races.template_link ? 'ШАБЛОН СВОЕЙ РАСЫ: ' + knowledge.races.template_link : '',
    'КЛАССЫ (базовые): ' + Object.entries(knowledge.classes.base_classes).map(([n, d]) => `${n} — ресурс: ${d.resource}; старт: ${d.start}; базовая атака: ${d.basic_attack}; способности: ${d.abilities}; истощение: ${d.exhaustion}`).join(' | '),
    'СИСТЕМА КЛАССОВ: ' + knowledge.classes.class_system,
    'ССЫЛКИ НА КЛАССЫ: ' + Object.entries(knowledge.classes.links || {}).filter(([, v]) => typeof v === 'string').map(([n, v]) => `${n}: ${v}`).join('; '),
    'ССЫЛКИ НА СПЕЦИАЛИЗАЦИИ: ' + Object.entries((knowledge.classes.links && knowledge.classes.links.specializations) || {}).map(([cls, specs]) => `${cls} — ${Object.entries(specs).map(([s, u]) => `${s}: ${u}`).join(', ')}`).join(' | '),
    knowledge.classes.level_pass_link ? 'ПАСС УРОВНЕЙ (статья): ' + knowledge.classes.level_pass_link : '',
    'ПАСС УРОВНЕЙ: ' + [knowledge.classes.level_pass?.note, ...(knowledge.classes.level_pass?.tiers || []).map((t) => `${t.name} (${t.range}): ` + t.rewards.map((r) => `${r.level} ур. — ${r.reward}`).join('; '))].filter(Boolean).join(' | '),
    knowledge.classes.template_link ? 'ШАБЛОН СВОЕГО КЛАССА: ' + knowledge.classes.template_link : '',
    'ПРАВИЛА БАЛАНСА КЛАССОВ: ' + knowledge.classes.class_balance_rules.join(' '),
    'КЛАССЫ ИГРОКОВ: ' + (knowledge.classes.player_classes || []).map((c) => `${c.name} (автор ${c.author}, ${c.url || ''})`).join('; '),
    'РАСЫ ИГРОКОВ: ' + (knowledge.races.player_races || []).map((r) => `${r.name} (автор ${r.author}, ${r.url || ''})`).join('; '),
    knowledge.classes.player_blog_link ? 'ВСЕ КЛАССЫ ИГРОКОВ (статья): ' + knowledge.classes.player_blog_link : '',
    knowledge.races.player_blog_link ? 'ВСЕ РАСЫ ИГРОКОВ (статья): ' + knowledge.races.player_blog_link : '',
    'ШАБЛОН АНКЕТЫ ПЕРСОНАЖА: ' + JSON.stringify(knowledge.character_template),
    knowledge.story_template ? 'ШАБЛОН ЗАЯВКИ НА СЮЖЕТ ДЛЯ ГМ:\n' + knowledge.story_template : '',
    'ПРОЦЕСС ВСТУПЛЕНИЯ: ' + knowledge.entry_process,
    'АДМИНИСТРАЦИЯ (направления): ' + (knowledge.administration?.roles || []).map((r) => r.name).join(', '),
    'СТУПЕНИ РОСТА: ' + (knowledge.administration?.levels_note || '') + ' ' + (knowledge.administration?.growth || ''),
    'ОБЩИЕ ПРАВИЛА КОМАНДЫ: ' + (knowledge.administration?.general || []).join(' ')
  ].filter(Boolean).join('\n');
}

export function languageName(lang) {
  return lang === 'en' ? 'English' : 'Russian';
}


// The model ignores formatting bans now and then, so strip markdown defensively.
export function stripMarkdown(text) {
  return String(text || '')
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, '$1$2')
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g, '$1$2')
    .replace(/^\s{0,3}[-*+]\s+/gm, '— ')
    .replace(/^\s{0,3}(\d+)\.\s+/gm, '$1) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const GUIDE_SYSTEM = (lang) => `Ты — Проводник чата Deeprealm: справочный гид по тёмному фэнтези-РП чату.
Отвечай на ${languageName(lang)}.
Ты отвечаешь ТОЛЬКО на вопросы о чате: правила, лор, мир, расы, классы, пасс уровней, администрация, шаблоны анкет, как вступить.
Ты НЕ ведёшь ролевую игру и НЕ играешь роль персонажа — только консультируешь.
Если вопрос не о чате — вежливо скажи, что помогаешь только по теме чата.
Если ответа нет в предоставленной информации — честно скажи, что не знаешь, и предложи спросить администрацию в чате.

КАК ОТВЕЧАТЬ:
1. Рассказывай СВОИМИ СЛОВАМИ по существу вопроса. Сначала ответ, потом при необходимости детали.
2. ФОРМАТИРОВАНИЕ ЗАПРЕЩЕНО: не используй звёздочки (*), решётки (#), подчёркивания для выделения, обратные кавычки и таблицы. Единственный допустимый маркер списка — тире "—" в начале строки. Пиши обычным текстом.
3. Когда рассказываешь про класс, расу или специализацию — НЕ отправляй читать статью. Перескажи сам: ресурс, старт, базовая атака, способности, механика истощения, роль, специализации — всё, что есть в информации ниже. Ссылку на статью давай только если игрок прямо попросил ссылку.
4. Ссылки давай только те, что есть в информации ниже. Никогда не придумывай ссылки, кнопки, файлы и адреса.

ССЫЛКИ И КОНТАКТЫ:
- Если игрок хочет связаться с владельцем или подать заявку — дай контакт ${knowledge.chat.owner} и ссылку на чат ${knowledge.chat.telegram}.
- По вопросам о составе администрации дай ссылку: ${knowledge.chat.administration || '(нет)'}.
- Про пасс уровней расскажи сам, а ссылку на статью дай только по прямой просьбе: ${knowledge.classes.level_pass_link || '(нет)'}.
Отвечай кратко и по делу.

ИНФОРМАЦИЯ О ЧАТЕ:
${buildKnowledgeContext(lang)}`;

export const INTERVIEWER_SYSTEM = (lang) => `Ты — Анкетолог чата Deeprealm: проверяющий персонажей, рас и классов для тёмного фэнтези-РП чата.
Общайся на ${languageName(lang)}.

ТВОЯ РОЛЬ: ты ведёшь живой диалог с новым игроком, помогаешь ему создать персонажа и проверяешь его.
ПРАВИЛА ПОВЕДЕНИЯ:
1. Задавай вопросы свободно и по смыслу, не обязательно строго по шаблону — уточняй то, что важно: баланс, лор, логику, слабости, мотивацию.
2. Когда игрок говорит "добавь в анкету" (или "add to the application"), ты ОБЯЗАТЕЛЬНО подтверждаешь: "Добавил в анкету: ..." и перечисляешь, что именно записал.
3. Когда игрок говорит "покажи анкету"/"show application" — выводи текущую собранную анкету по шаблону.
4. Проверяй заявку по правилам баланса (см. информацию). Если что-то не так — вежливо объясни, что исправить.
5. Когда всё заполнено и проверено и нарушений нет — напиши краткое резюме проверки и пометку "ОДОБРЕНО ✅". Финальную фразу про отправку анкеты и контакт владельца сайт добавит сам, поэтому тебе её писать не нужно. Не выдавай ссылку на чат раньше окончания проверки.
6. Персонаж не может быть неуязвимым: обязательно должны быть сильные и слабые стороны. Если игрок делает "имбу" — укажи на это.
7. Будь дружелюбным, но требовательным к балансу и логике лора.
8. ЕДИНСТВЕННАЯ ссылка, которую ты можешь давать — на чат Telegram: ${knowledge.chat.telegram}. НИКОГДА не придумывай другие ссылки, кнопки, файлы, "базы данных" или адреса сайтов. Если ссылка на чат ещё не положена по проверке — не давай никаких ссылок вообще.
9. Ты не сохраняешь ничего в базах и не запускаешь игру. Единственное финальное действие — резюме проверки, пометка "ОДОБРЕНО ✅" и ссылка на Telegram-чат.
10. Если анкета расы или класса заполнена полностью и нарушений баланса нет — СРАЗУ пиши пометку "ОДОБРЕНО ✅" и завершай проверку. Не спрашивай "перенести в итоговый формат?" и не предлагай обсудить детали: статья для сайта будет опубликована автоматически. Никаких вопросов после одобрения.

ЗАЯВКИ НА СЮЖЕТ ДЛЯ ГМ:
Если игрок хочет предложить сюжет, приключение или квест для ГМ — помоги оформить заявку по шаблону ниже. Не требуй заполнить всё сразу: задавай по 2–3 вопроса за раз и в конце собери заявку целиком. Если игрок не знает, что написать — предложи пример и объясни, почему для ГМ это важно. Напоминай правила: не пиши сценарий, пиши ситуацию; давай личный крючок под персонажей; согласуй идеи с лором мира.

${knowledge.story_template ? knowledge.story_template : '(шаблон заявки на сюжет не задан)'}

 ИНФОРМАЦИЯ О ЧАТЕ:
${buildKnowledgeContext(lang)}`;

export const STAFF_SYSTEM = (lang) => `Ты — Анкетолог по кандидатам в команду Telegram-чата Deeprealm (текстовое тёмное фэнтези-РП).
Отвечай на ${languageName(lang)}. Пиши обычным текстом, без звёздочек, решёток, подчёркиваний и нумерации "1." Списки — только тире. Очень коротко.

ГЛАВНОЕ: ты собеседуешь кандидата в команду ИМЕННО ЭТОГО Telegram-РП-проекта. Ты НЕ общий ассистент. Запрещены темы Discord, VK, Roll20, Foundry, D&D, настольных игр, грантов, возраста, города, часового пояса, реального имени и контактов. Не предлагай гайды, стратегии и «чем я могу помочь».

Ты задаёшь кандидату вопросы СТРОГО по одному, в заданном порядке. Не придумывай свои вопросы.

ПРАВИЛА:
1. При выборе направления задай ровно один вопрос: "В какое направление хочешь: зам владельца, пиарщик, модератор, разработчик, гейм-мастер, анкетолог или ивентолог?" Больше ничего.
2. В остальных случаях тебе дают ГОТОВЫЙ вопрос. Ты должен: коротко (в одну фразу) отреагировать на предыдущий ответ кандидата, если он был, и задать этот готовый вопрос. Не добавляй других вопросов, не перечисляй пункты, не давай советов.
3. Если ответ кандидата пустой или уклончивый — мягко переспроси тот же вопрос.
4. Если кандидат просит показать заявку — выведи то, что собрано.
5. Единственная допустимая ссылка — ${knowledge.chat.telegram}. Контакт владельца: ${knowledge.chat.owner}. Больше никаких ссылок.
6. Когда тебе дают команду подвести итог — дай краткое заключение: сильные стороны и сомнения. Финальную фразу про пометку «РЕКОМЕНДОВАН», юз владельца и просьбу написать ему сайт добавляет сам, поэтому тебе её писать не нужно.
7. ОТВЕЧАЙ НА УТОЧНЯЮЩИЕ ВОПРОСЫ. Кандидаты часто спрашивают «а как часто надо приводить людей?», «сколько времени это займёт?», «а если я пропаду?», «платят ли за это?». Это нормально — ответь по существу, опираясь на данные об активности ниже, и постарайся назвать конкретные числа (например: «для пиарщика норма — 1–2 человека в две недели»). Ответ на такой вопрос НЕ считается ответом на вопрос собеседования: после ответа задай тот же самый вопрос кандидату заново.
8. Тон — дружелюбный и спокойный, без жёсткости и давления. Ты не отказываешь и не осуждаешь, а объясняешь. Кандидаты не обязаны знать нормы заранее — это ты им и рассказываешь.`;

export function branchPrompt(lang) {
  return lang === 'en'
    ? 'Hi. Which branch do you want to join: deputy owner, PR, moderator, developer, game master, application reviewer or event manager?'
    : 'Привет. В какое направление хочешь вступить: зам владельца, пиарщик, модератор, разработчик, гейм-мастер, анкетолог или ивентолог?';
}

// Direct, sourced answers to the questions candidates actually ask, so the reply
// does not depend on the model recalling the numbers correctly.
export function matchActivityFaq(text) {
  const s = String(text || '').toLowerCase();
  if (!s) return null;
  const items = knowledge.administration?.activity_faq || [];
  let best = null;
  let bestScore = 0;
  for (const item of items) {
    const words = item.q.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const score = words.filter((w) => s.includes(w)).length;
    if (score > bestScore) { bestScore = score; best = item; }
  }
  return bestScore > 0 ? best : null;
}

export function findRole(key) {
  return (knowledge.administration?.roles || []).find((r) => r.key === key) || null;
}

// The hand-off wording is fixed here so the destination and the owner's username
// are never paraphrased by the model. When the bot managed to publish the race or
// class article itself, it says so instead of asking for the owner.
export function handoffText(type, lang, { approved = false, published = null } = {}) {
  const chat = knowledge.chat.telegram;
  const owner = knowledge.chat.owner;
  if (type === 'interview') {
    const note = publishNote(lang, published, owner);
    return lang === 'en'
      ? `Send the character sheet to the application desk in the Telegram chat:\n${chat}${note}`
      : `Кидайте анкету персонажа в анкетницу в тг-чате:\n${chat}${note}`;
  }
  if (type === 'staff') {
    return lang === 'en'
      ? `Here is the owner: ${owner}\nWrite to the owner and say that I checked you.`
      : `Вот юз владельца: ${owner}\nНапиши ему, что я тебя проверил.`;
  }
  return lang === 'en'
    ? `The chat link stays here, so you can join whenever you like:\n${chat}`
    : `Ссылка на чат остаётся здесь, по ней можно перейти в любой момент:\n${chat}`;
}

// The owner requires every assistant reply to end with this word. It is appended
// here rather than left to the model, which forgets it on longer answers; the
// guard keeps a reply that already ends with it from getting a second one.
const END_WORD = 'конец';
export function withEnd(text) {
  const body = String(text ?? '').trim();
  if (!body) return body;
  if (new RegExp(`(^|\\s)${END_WORD}\\s*[.!?]*$`, 'i').test(body)) return body;
  return `${body}\n\n${END_WORD}`;
}

// What an approved player is told about their race or class article.
export function publishNote(lang, published, owner) {
  if (!published) {
    return lang === 'en'
      ? `\n\nWant your own race or class? The article is published by the owner ${owner}: send the sheet and you are in.`
      : `\n\nХочешь свою расу или класс? Статью публикует владелец ${owner}: скинь анкету, и ты принят.`;
  }
  const kind = published.kind === 'race' ? (lang === 'en' ? 'race' : 'раса') : (lang === 'en' ? 'class' : 'класс');
  return lang === 'en'
    ? `\n\nYour article is already on the site: ${kind} "${published.title}". See the Articles section.`
    : `\n\nСтатья уже на сайте: ${kind} «${published.title}». Смотри раздел «Статьи».`;
}

// `approved` marks a completed check. Ending early still gives the hand-off, but
// without the approval mark, which would be a false claim.
export function finaleText(type, lang, { approved = false } = {}) {
  if (type === 'interview') {
    const head = approved
      ? (lang === 'en' ? 'That is the end of the check. ОДОБРЕНО ✅' : 'На этом проверка закончена. ОДОБРЕНО ✅')
      : (lang === 'en' ? 'That is the end.' : 'На этом всё.');
    return `${head}\n\n${handoffText('interview', lang, { approved })}`;
  }
  if (type === 'staff') {
    const head = approved
      ? (lang === 'en' ? 'That is the end of the interview. РЕКОМЕНДОВАН ✅' : 'На этом собеседование закончено. РЕКОМЕНДОВАН ✅')
      : (lang === 'en' ? 'That is the end of the interview.' : 'На этом собеседование закончено.');
    return `${head}\n\n${handoffText('staff', lang)}`;
  }
  return `${lang === 'en' ? 'That is the end.' : 'На этом всё.'}\n\n${handoffText('guide', lang)}`;
}

// An approval counts when the model says the application passed AND the conversation
// actually holds a filled-in sheet. The model paraphrases its verdict freely
// ("ОДОБРЕНО ✅", "заявка одобрена", "официально одобряю"), so the verdict is matched
// loosely while the sheet itself is checked against the dialogue and the draft.
export const APPROVAL_RE = /одобр|принят|approv|accept/i;
export const SHEET_FIELDS = [/имя\s*[:\-—]/i, /раса\s*[:\-—]/i, /класс\s*[:\-—]/i, /"name"/i, /"race"/i, /"class"/i, /название\s*[:\-—]/i, /самоназвание/i, /уязвимост/i];

export function hasFilledSheet(messages, application = {}) {
  if (sheetDetector(messages, application)) return true;
  const text = `${(Array.isArray(messages) ? messages : []).map((m) => String(m?.content || '')).join('\n')}\n${JSON.stringify(application || {})}`;
  return SHEET_FIELDS.filter((re) => re.test(text)).length >= 2;
}

export function approvedWithSheet(text, messages, application) {
  const s = String(text || '');
  if (!APPROVAL_RE.test(s)) return false;
  return hasFilledSheet(messages, application);
}

export function buildStaffContext() {
  const a = knowledge.administration || {};
  return [
    a.intro || '',
    'СТУПЕНИ: ' + (a.levels_note || '') + ' ' + (a.growth || ''),
    ...(a.roles || []).map((r) => [
      `— ${r.name}`,
      `  Практикант: ${r.practice}`,
      `  Основная степень: ${r.main}`,
      `  Главный: ${r.chief}`,
      r.pace ? `  Обычная активность: ${r.pace}` : '',
      `  Вопросы кандидату: ${(r.questions || []).join(' ')}`
    ].filter(Boolean).join('\n')),
    'ОБЩИЕ ПРАВИЛА: ' + (a.general || []).join(' '),
    'ЧАСТЫЕ ВОПРОСЫ КАНДИДАТОВ:',
    ...(a.activity_faq || []).map((f) => `— «${f.q}» → ${f.a}`),
    a.apply_hint ? 'ВАЖНО: ' + a.apply_hint : ''
  ].filter(Boolean).join('\n');
}

// Detect the branch the candidate is talking about, so the model cannot drift
// into a generic "moderator for Discord/VK" script.
export const ROLE_KEYWORDS = {
  deputy: ['зам владельца', 'заместител', 'зам ', 'правая рука', 'deputy'],
  pr: ['пиар', 'реклам', 'маркетолог', 'продвижен', 'pr ', 'соцсет'],
  moderator: ['модерат', 'модер', 'moderator'],
  developer: ['разраб', 'программист', 'кодер', 'developer', 'dev '],
  gm: ['гейм-мастер', 'гейм мастер', 'гм', 'game master', 'gm '],
  reviewer: ['анкетолог', 'анкеты', 'reviewer'],
  event: ['ивент', 'event', 'мероприят']
};

export function detectRole(messages) {
  const text = messages.map((m) => String(m.content || '')).join(' ').toLowerCase();
  for (const [key, words] of Object.entries(ROLE_KEYWORDS)) {
    if (words.some((w) => text.includes(w))) return findRole(key);
  }
  return null;
}

// Candidates often ask a clarifying question instead of answering ("how often
// should I bring people in?"). Treat those as questions, not answers, so the
// scripted interview does not silently skip a step.
export const QUESTION_START = /^(а\s+)?(как|сколько|что|почему|зачем|когда|какой|какая|какие|какое|где|кто|куда|можно|нужно|надо|стоит|есть ли|обязательно|how|what|why|when|where|who|which|can i|do i|is there|are there|does|must i|should i)/i;

export function looksLikeQuestion(text) {
  const s = String(text || '').trim().toLowerCase();
  if (!s) return false;
  return s.includes('?') || QUESTION_START.test(s);
}

// The user explicitly ends the conversation. Checked before question detection so
// "конец?" still counts as an ending, not as a counter-question.
export const END_COMMAND = /^(конец|закончили|закончить|итог|завершить|завершай|финал|end|finish|done|that'?s all|the end)\s*[.!?]*$/i;

export function isEndCommand(text) {
  const s = String(text || '').trim().toLowerCase();
  if (!s) return false;
  return END_COMMAND.test(s);
}


// Fixed question order per branch. The model only phrases the next scripted question,
// which keeps the interview on track instead of drifting into generic advice.
export function staffTurn(history, appState = {}, lang = 'ru') {
  const role = detectRole(history) || findRole(appState.branch || '');
  if (!role) {
    const last = history.filter((m) => m.role !== 'assistant').pop();
    return {
      role: null, question: branchPrompt(lang), asked: 0, total: 0, done: false,
      askingQuestion: Boolean(last && looksLikeQuestion(last.content))
    };
  }
  const questions = role.questions || [];
  const userMessages = history.filter((m) => m.role !== 'assistant');
  // The first user message picks the branch; only later messages can be answers.
  const answers = userMessages.slice(1).filter((m) => !looksLikeQuestion(m.content));
  const asked = answers.length;
  const last = userMessages[userMessages.length - 1];
  const done = asked >= questions.length;
  return {
    role,
    asked,
    total: questions.length,
    done,
    question: done ? '' : questions[asked],
    askingQuestion: Boolean(last && looksLikeQuestion(last.content))
  };
}
