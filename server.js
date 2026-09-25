import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncPlayerContent, defaultSources } from './blog-sync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_PATH = path.join(__dirname, 'data', 'knowledge.json');

// Minimal .env loader (optional), so the AI key can live outside the code.
const envFile = path.join(__dirname, '.env');
if (process.env.NODE_ENV !== 'test' && fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
}

let knowledge = JSON.parse(fs.readFileSync(KNOWLEDGE_PATH, 'utf8'));
const reloadKnowledge = () => { knowledge = JSON.parse(fs.readFileSync(KNOWLEDGE_PATH, 'utf8')); };

const PORT = process.env.PORT || 3000;
const LLM_API_KEY = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY || process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || '';
const LLM_BASE_URL = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';
const LLM_FALLBACK_MODELS = (process.env.LLM_FALLBACK_MODELS || '')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/knowledge', (req, res) => {
  res.json({
    chat: knowledge.chat,
    rules: knowledge.rules,
    lore: knowledge.lore,
    races: {
      list: knowledge.races.list,
      links: knowledge.races.links || {},
      relations: knowledge.races.relations,
      rules: knowledge.races.race_template_rules,
      fields: knowledge.races.race_template_fields,
      templateLink: knowledge.races.template_link || '',
      blogLink: knowledge.races.blog_link || '',
      playerBlogLink: knowledge.races.player_blog_link || '',
      playerRaces: knowledge.races.player_races || []
    },
    classes: {
      ...knowledge.classes,
      playerBlogLink: knowledge.classes.player_blog_link || '',
      playerClasses: knowledge.classes.player_classes || []
    },
    characterTemplate: knowledge.character_template,
    storyTemplate: knowledge.story_template || '',
    entryProcess: knowledge.entry_process,
    administration: knowledge.administration
  });
});

// Compact, structured context injected into every model prompt.
function buildKnowledgeContext(lang) {
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

function languageName(lang) {
  return lang === 'en' ? 'English' : 'Russian';
}

async function callLLM(messages, options = {}) {
  const models = [LLM_MODEL, ...LLM_FALLBACK_MODELS];
  let lastError;
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await callModel(model, messages, options);
      } catch (err) {
        lastError = err;
        const transient = /\b(404|429|500|503)\b/.test(err.message);
        if (!transient) throw err;
        // 404 means the model is gone: move on to the next one immediately.
        if (/\b404\b/.test(err.message)) break;
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

async function callModel(model, messages, options = {}) {
  const response = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LLM_API_KEY}`
    },
    body: JSON.stringify({ model, messages, temperature: options.temperature ?? 0.6 })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM error ${response.status}: ${text.slice(0, 300)}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
}

// The model ignores formatting bans now and then, so strip markdown defensively.
function stripMarkdown(text) {
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

const GUIDE_SYSTEM = (lang) => `Ты — Проводник чата Deeprealm: справочный гид по тёмному фэнтези-РП чату.
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

const INTERVIEWER_SYSTEM = (lang) => `Ты — Анкетолог чата Deeprealm: проверяющий персонажей, рас и классов для тёмного фэнтези-РП чата.
Общайся на ${languageName(lang)}.

ТВОЯ РОЛЬ: ты ведёшь живой диалог с новым игроком, помогаешь ему создать персонажа и проверяешь его.
ПРАВИЛА ПОВЕДЕНИЯ:
1. Задавай вопросы свободно и по смыслу, не обязательно строго по шаблону — уточняй то, что важно: баланс, лор, логику, слабости, мотивацию.
2. Когда игрок говорит "добавь в анкету" (или "add to the application"), ты ОБЯЗАТЕЛЬНО подтверждаешь: "Добавил в анкету: ..." и перечисляешь, что именно записал.
3. Когда игрок говорит "покажи анкету"/"show application" — выводи текущую собранную анкету по шаблону.
4. Проверяй заявку по правилам баланса (см. информацию). Если что-то не так — вежливо объясни, что исправить.
5. Когда всё заполнено и проверено и нарушений нет — напиши краткое резюме проверки, пометку "ОДОБРЕНО ✅" и дай ссылку на чат: ${knowledge.chat.telegram}. Не выдавай ссылку, пока проверка не завершена.
6. Персонаж не может быть неуязвимым: обязательно должны быть сильные и слабые стороны. Если игрок делает "имбу" — укажи на это.
7. Будь дружелюбным, но требовательным к балансу и логике лора.
8. ЕДИНСТВЕННАЯ ссылка, которую ты можешь давать — на чат Telegram: ${knowledge.chat.telegram}. НИКОГДА не придумывай другие ссылки, кнопки, файлы, "базы данных" или адреса сайтов. Если ссылка на чат ещё не положена по проверке — не давай никаких ссылок вообще.
9. Ты не сохраняешь ничего в базах и не запускаешь игру. Единственное финальное действие — резюме проверки, пометка "ОДОБРЕНО ✅" и ссылка на Telegram-чат.

ЗАЯВКИ НА СЮЖЕТ ДЛЯ ГМ:
Если игрок хочет предложить сюжет, приключение или квест для ГМ — помоги оформить заявку по шаблону ниже. Не требуй заполнить всё сразу: задавай по 2–3 вопроса за раз и в конце собери заявку целиком. Если игрок не знает, что написать — предложи пример и объясни, почему для ГМ это важно. Напоминай правила: не пиши сценарий, пиши ситуацию; давай личный крючок под персонажей; согласуй идеи с лором мира.

${knowledge.story_template ? knowledge.story_template : '(шаблон заявки на сюжет не задан)'}

 ИНФОРМАЦИЯ О ЧАТЕ:
${buildKnowledgeContext(lang)}`;

const STAFF_SYSTEM = (lang) => `Ты — Анкетолог по кандидатам в команду Telegram-чата Deeprealm (текстовое тёмное фэнтези-РП).
Отвечай на ${languageName(lang)}. Пиши обычным текстом, без звёздочек, решёток, подчёркиваний и нумерации "1." Списки — только тире. Очень коротко.

ГЛАВНОЕ: ты собеседуешь кандидата в команду ИМЕННО ЭТОГО Telegram-РП-проекта. Ты НЕ общий ассистент. Запрещены темы Discord, VK, Roll20, Foundry, D&D, настольных игр, грантов, возраста, города, часового пояса, реального имени и контактов. Не предлагай гайды, стратегии и «чем я могу помочь».

Ты задаёшь кандидату вопросы СТРОГО по одному, в заданном порядке. Не придумывай свои вопросы.

ПРАВИЛА:
1. При выборе направления задай ровно один вопрос: "В какое направление хочешь: зам владельца, пиарщик, модератор, разработчик, гейм-мастер, анкетолог или ивентолог?" Больше ничего.
2. В остальных случаях тебе дают ГОТОВЫЙ вопрос. Ты должен: коротко (в одну фразу) отреагировать на предыдущий ответ кандидата, если он был, и задать этот готовый вопрос. Не добавляй других вопросов, не перечисляй пункты, не давай советов.
3. Если ответ кандидата пустой или уклончивый — мягко переспроси тот же вопрос.
4. Если кандидат просит показать заявку — выведи то, что собрано.
5. Единственная допустимая ссылка — ${knowledge.chat.telegram}. Контакт владельца: ${knowledge.chat.owner}. Больше никаких ссылок.
6. Когда тебе дают команду подвести итог — дай краткое заключение: сильные стороны, сомнения, и поставь пометку «РЕКОМЕНДОВАН», если ответы были по существу. Укажи, что решение за владельцем.
7. ОТВЕЧАЙ НА УТОЧНЯЮЩИЕ ВОПРОСЫ. Кандидаты часто спрашивают «а как часто надо приводить людей?», «сколько времени это займёт?», «а если я пропаду?», «платят ли за это?». Это нормально — ответь по существу, опираясь на данные об активности ниже, и постарайся назвать конкретные числа (например: «для пиарщика норма — 1–2 человека в две недели»). Ответ на такой вопрос НЕ считается ответом на вопрос собеседования: после ответа задай тот же самый вопрос кандидату заново.
8. Тон — дружелюбный и спокойный, без жёсткости и давления. Ты не отказываешь и не осуждаешь, а объясняешь. Кандидаты не обязаны знать нормы заранее — это ты им и рассказываешь.`;

function branchPrompt(lang) {
  return lang === 'en'
    ? 'Hi. Which branch do you want to join: deputy owner, PR, moderator, developer, game master, application reviewer or event manager?'
    : 'Привет. В какое направление хочешь вступить: зам владельца, пиарщик, модератор, разработчик, гейм-мастер, анкетолог или ивентолог?';
}

// Direct, sourced answers to the questions candidates actually ask, so the reply
// does not depend on the model recalling the numbers correctly.
function matchActivityFaq(text) {
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

function findRole(key) {
  return (knowledge.administration?.roles || []).find((r) => r.key === key) || null;
}

function buildStaffContext() {
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
const ROLE_KEYWORDS = {
  deputy: ['зам владельца', 'заместител', 'зам ', 'правая рука', 'deputy'],
  pr: ['пиар', 'реклам', 'маркетолог', 'продвижен', 'pr ', 'соцсет'],
  moderator: ['модерат', 'модер', 'moderator'],
  developer: ['разраб', 'программист', 'кодер', 'developer', 'dev '],
  gm: ['гейм-мастер', 'гейм мастер', 'гм', 'game master', 'gm '],
  reviewer: ['анкетолог', 'анкеты', 'reviewer'],
  event: ['ивент', 'event', 'мероприят']
};

function detectRole(messages) {
  const text = messages.map((m) => String(m.content || '')).join(' ').toLowerCase();
  for (const [key, words] of Object.entries(ROLE_KEYWORDS)) {
    if (words.some((w) => text.includes(w))) return findRole(key);
  }
  return null;
}

// Candidates often ask a clarifying question instead of answering ("how often
// should I bring people in?"). Treat those as questions, not answers, so the
// scripted interview does not silently skip a step.
const QUESTION_START = /^(а\s+)?(как|сколько|что|почему|зачем|когда|какой|какая|какие|какое|где|кто|куда|можно|нужно|надо|стоит|есть ли|обязательно|how|what|why|when|where|who|which|can i|do i|is there|are there|does|must i|should i)/i;

function looksLikeQuestion(text) {
  const s = String(text || '').trim().toLowerCase();
  if (!s) return false;
  return s.includes('?') || QUESTION_START.test(s);
}

// Fixed question order per branch. The model only phrases the next scripted question,
// which keeps the interview on track instead of drifting into generic advice.
function staffTurn(history, appState = {}, lang = 'ru') {
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

app.get('/api/status', (req, res) => {
  res.json({ configured: Boolean(LLM_API_KEY) });
});

// Always-available join link, so the site can show it without waiting for AI.
app.get('/api/chat-link', (req, res) => {
  res.json({ chat: knowledge.chat.telegram, owner: knowledge.chat.owner, contact: knowledge.chat.contact || '' });
});

// Pull new player-made races/classes from the blog.
async function runBlogSync() {
  try {
    const result = await syncPlayerContent(KNOWLEDGE_PATH, defaultSources(KNOWLEDGE_PATH));
    if (result.changed) reloadKnowledge();
    if (result.errors.length) console.warn('blog sync:', result.errors.join(' | '));
    return result;
  } catch (err) {
    console.warn('blog sync failed:', err.message);
    return { changed: false, racesAdded: [], classesAdded: [], errors: [err.message] };
  }
}

app.post('/api/refresh', async (req, res) => {
  res.json(await runBlogSync());
});

app.post('/api/guide', async (req, res) => {
  const { messages = [], lang = 'ru' } = req.body || {};
  const history = Array.isArray(messages) ? messages.slice(-20) : [];
  if (!LLM_API_KEY) return res.status(503).json({ error: 'not_configured' });
  try {
    const reply = await callLLM([
      { role: 'system', content: GUIDE_SYSTEM(lang) },
      ...history.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }))
    ]);
    res.json({ reply: stripMarkdown(reply) });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post('/api/interview', async (req, res) => {
  const { messages = [], lang = 'ru', application = {} } = req.body || {};
  const history = Array.isArray(messages) ? messages.slice(-30) : [];
  const appState = application && typeof application === 'object' ? application : {};
  if (!LLM_API_KEY) return res.status(503).json({ error: 'not_configured' });
  try {
    const reply = await callLLM([
      { role: 'system', content: INTERVIEWER_SYSTEM(lang) },
      { role: 'system', content: `ТЕКУЩАЯ ЧЕРНОВАЯ АНКЕТА (JSON): ${JSON.stringify(appState)}` },
      ...history.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }))
    ]);
    res.json({ reply: stripMarkdown(reply), application: appState });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Interview candidates who want to join the project team.
// The question order is fixed server-side, so the model only phrases the next question
// instead of drifting into a generic "how to become a moderator" script.
app.post('/api/staff', async (req, res) => {
  const { messages = [], lang = 'ru', application = {} } = req.body || {};
  const history = Array.isArray(messages) ? messages.slice(-30) : [];
  const appState = application && typeof application === 'object' ? application : {};
  if (!LLM_API_KEY) return res.status(503).json({ error: 'not_configured' });

  const turn = staffTurn(history, appState, lang);
  if (!turn.role) {
    if (turn.askingQuestion) {
      const faq = matchActivityFaq(history.filter((m) => m.role !== 'assistant').pop()?.content);
      if (faq) {
        try {
          const reply = await callLLM([
            { role: 'system', content: `${STAFF_SYSTEM(lang)}\n\nКандидат задал уточняющий вопрос до выбора направления. Ответь на него коротко и дружелюбно, опираясь на факт ниже, затем задай вопрос о направлении.\nФАКТ: ${faq.a}` },
            ...history.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }))
          ], { temperature: 0.3 });
          return res.json({ reply: stripMarkdown(reply), application: appState, role: null, done: false });
        } catch (err) {
          return res.status(502).json({ error: err.message });
        }
      }
    }
    return res.json({ reply: turn.question, application: appState, role: null, done: false });
  }
  const { role, asked, done } = turn;
  const questions = role.questions || [];
  const lastUser = history.filter((m) => m.role !== 'assistant').pop();
  const faq = turn.askingQuestion ? matchActivityFaq(lastUser?.content) : null;

  const focus = [
    `НАПРАВЛЕНИЕ: ${role.name}. ${role.main}`,
    role.pace ? `ОБЫЧНАЯ АКТИВНОСТЬ: ${role.pace}` : '',
    `ВОПРОСЫ ПО ПОРЯДКУ: ${questions.map((q, i) => `${i + 1}) ${q}`).join(' ')}`,
    `Прогресс: задано ${asked} из ${questions.length}.`,
    faq
      ? `КАНДИДАТ ЗАДАЛ УТОЧНЯЮЩИЙ ВОПРОС. Ответь дружелюбно и конкретно, опираясь на факт ниже, и НЕ считай это ответом на собеседование. Затем задай тот же вопрос заново: "${turn.question}"\nФАКТ ДЛЯ ОТВЕТА: ${faq.a}`
      : done
        ? 'ЗАДАНИЕ: подведи итог собеседования по правилу 6.'
        : `ЗАДАНИЕ: коротко отреагируй на ответ кандидата и задай РОВНО ОДИН следующий вопрос: "${turn.question}". Больше ничего не добавляй.`
  ].filter(Boolean).join('\n');

  try {
    const reply = await callLLM([
      { role: 'system', content: `${STAFF_SYSTEM(lang)}\n\nТЕКУЩЕЕ ЗАДАНИЕ:\n${focus}\n\nЗапрещённые темы ещё раз: Discord, VK, Roll20, Foundry, настольные системы, возраст, город, часовой пояс, контакты, гранты.` },
      { role: 'user', content: `ЧЕРНОВАЯ ЗАЯВКА (JSON): ${JSON.stringify({ ...appState, branch: role.key })}` },
      ...history.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }))
    ], { temperature: 0.2 });
    res.json({ reply: stripMarkdown(reply), application: { ...appState, branch: role.key }, role: role.key, done });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// The frontend routes by hash (#staff), but links may arrive without the hash.
// Serve the app shell for unknown paths so deep links do not 404.
app.get(/^(?!\/api\/).*/, (req, res, next) => {
  if (path.extname(req.path)) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Deeprealm site running on http://localhost:${PORT}`);
    if (!LLM_API_KEY) console.warn('ВНИМАНИЕ: LLM_API_KEY не задан — ИИ-чаты будут недоступны до настройки ключа.');
  });

  // Keep player-made races/classes in sync with the blog; the site only reads the local cache.
  const SYNC_MINUTES = Number(process.env.BLOG_SYNC_MINUTES || 60);
  if (SYNC_MINUTES > 0) {
    runBlogSync();
    setInterval(runBlogSync, SYNC_MINUTES * 60 * 1000).unref();
  }
}

export { app, buildKnowledgeContext, buildStaffContext, isLLMConfigured, staffTurn, stripMarkdown, matchActivityFaq };
function isLLMConfigured() {
  return Boolean(LLM_API_KEY);
}
