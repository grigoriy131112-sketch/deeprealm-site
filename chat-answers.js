// The three chat handlers live here rather than in the server, so the browser can
// run the very same rules when no server is reachable. Only the model call and
// the article publishing are injected, because those differ per environment.
import {
  withEnd, stripMarkdown, finaleText, isEndCommand, approvedWithSheet, handoffText,
  sentToOwnerText, applicationTitle, staffAnswerPairs, detectSheet,
  staffTurn, matchActivityFaq, GUIDE_SYSTEM, INTERVIEWER_SYSTEM, STAFF_SYSTEM
} from './chat-core.js';
import { localGuide, localInterview, localStaff } from './ai-engine.js';
import { keepsEssentials } from './ai-maker.js';

let modelCaller = null;
let freeCaller = null;
let liveCaller = null;
let notifierFn = null;
export function setModelCaller(fn) { modelCaller = typeof fn === 'function' ? fn : null; }
// An optional keyless wording upgrade. It is tried only for the free-form Guide
// chat and only when no paid key is set; the built-in engine answers either way.
export function setFreeModelCaller(fn) { freeCaller = typeof fn === 'function' ? fn : null; }
// The live-speech layer. It rewrites the engine's answer in a natural voice, so
// the chat reads like a person rather than the knowledge base. It is optional and
// its output is rejected unless it keeps the facts, the links and the format.
export function setLiveCaller(fn) { liveCaller = typeof fn === 'function' ? fn : null; }
// Where the owner notifications go. The server injects its notifier; the browser
// bundle injects one that talks to Telegram directly, which is what keeps the
// notifications working on static hosting. With none set, nothing is sent and the
// closing line says the owner could not be reached automatically.
export function setNotifier(fn) { notifierFn = typeof fn === 'function' ? fn : null; }

function callModel(messages, options) {
  if (!modelCaller) throw new Error('model caller is not configured');
  return modelCaller(messages, options);
}

// The site's own engine is the floor, not a fallback of last resort: it needs no
// key and no network, so a missing, expired or rate-limited model key can never
// take the chats down. A working model still wins, because its wording is better;
// every failure below simply falls through to the built-in answer.
async function askModelOrLocal(promptMessages, localAnswer, options = {}) {
  if (modelCaller) {
    try {
      const reply = await callModel(promptMessages, options);
      if (reply && String(reply).trim()) return { reply: stripMarkdown(reply), by: 'model' };
    } catch { /* no key, expired key, quota or network: the built-in engine answers */ }
  }
  if (freeCaller && options.keyless) {
    try {
      const reply = await freeCaller(promptMessages, options);
      if (reply && String(reply).trim()) return { reply: stripMarkdown(reply), by: 'keyless' };
    } catch { /* the free public endpoint is often down: fall through */ }
  }
  const local = localAnswer();
  // Nothing better is available, so the engine's answer is rewritten in a natural
  // voice. A rewrite that loses a link, the ending word or the approval mark is
  // discarded and the exact engine text is used instead.
  if (liveCaller && options.live) {
    try {
      const spoken = await liveCaller(liveMessages(promptMessages, local, options), { temperature: 0.8 });
      if (spoken && keepsEssentials(withEnd(spoken), withEnd(local))) return { reply: stripMarkdown(spoken), by: 'live' };
    } catch { /* the free endpoint is unreliable: the engine's own text stands */ }
  }
  return { reply: local, by: 'local' };
}

// The rewrite prompt. The rules are given as facts to preserve, not as a topic to
// discuss, so the model cannot drift into inventing lore the chat does not have.
function liveMessages(history, local, options) {
  const question = lastUserText(Array.isArray(history) ? history : []) || '';
  const rules = [
    'Ты — голос ИИ-помощника тёмного фэнтези-РП чата Deeprealm.',
    options.role === 'interview'
      ? 'Ты Анкетолог: помогаешь собрать и проверить анкету персонажа, расы или класса.'
      : options.role === 'staff'
        ? 'Ты Анкетолог по кандидатам в команду: собеседуешь и задаёшь вопросы по одному.'
        : 'Ты Проводник: справочный гид по чату — правила, лор, расы, классы, пасс уровней, администрация, как вступить.',
    'Перепиши готовый ответ своими словами, живо и по-дружески. Обращайся к собеседнику на «ты».',
    'Сохрани ВСЕ факты, числа, названия, ссылки и концовку. Ничего не выдумывай и не добавляй от себя.',
    'Не используй звёздочки, решётки, обратные кавычки и таблицы. Списки — только тире.',
    'Ответ должен заканчиваться словом «конец».',
    'Длина — примерно как у исходного ответа. Не добавляй вопросов и предложений, которых не было.'
  ].join('\n');
  return [
    { role: 'system', content: rules },
    { role: 'user', content: `Вопрос игрока: ${question}\n\nГотовый ответ (перепиши его):\n${local}` }
  ];
}


const toHistory = (messages, limit) => (Array.isArray(messages) ? messages.slice(-limit) : []);
const asRole = (m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') });
const lastUserText = (history) => history.filter((m) => m.role !== 'assistant').pop()?.content;

// The closing command is answered with fixed text, so a missing key must not block
// it. Everything else needs the model.
export function needsModel({ messages = [] } = {}) {
  return !isEndCommand(lastUserText(toHistory(messages, 30)));
}

export async function answerGuide({ messages = [], lang = 'ru' } = {}) {
  const history = toHistory(messages, 20);
  // Ending the dialogue needs no model, so it works with no key and no network.
  if (isEndCommand(lastUserText(history))) return { reply: withEnd(finaleText('guide', lang)), finale: true };
  const { reply, by } = await askModelOrLocal([
    { role: 'system', content: GUIDE_SYSTEM(lang) },
    ...history.map(asRole)
  ], () => localGuide({ messages: history, lang }), { keyless: true, live: true, role: 'guide' });
  return { reply: withEnd(reply), source: by };
}

export async function answerInterview({ messages = [], lang = 'ru', application = {}, publish = null, notify = null } = {}) {
  const history = toHistory(messages, 30);
  const appState = application && typeof application === 'object' ? application : {};
  // A caller-supplied notifier wins; otherwise the shared one is used, so the
  // browser bundle sends notifications without the page having to pass anything.
  const send = typeof notify === 'function' ? notify : notifierFn;
  if (isEndCommand(lastUserText(history))) {
    return { reply: withEnd(finaleText('interview', lang)), application: appState, finale: true };
  }
  const { reply: raw, by } = await askModelOrLocal([
    { role: 'system', content: INTERVIEWER_SYSTEM(lang) },
    { role: 'system', content: `ТЕКУЩАЯ ЧЕРНОВАЯ АНКЕТА (JSON): ${JSON.stringify(appState)}` },
    ...history.map(asRole)
  ], () => localInterview({ messages: history, lang, application: appState }), { live: true, role: 'interview' });
  const clean = raw;
  // The model's own "ОДОБРЕНО" means the check passed; the fixed hand-off is attached
  // so the destination and the owner's username are never paraphrased.
  const approved = approvedWithSheet(clean, history, appState);
  let published = null;
  let delivered = false;
  let sheetKind = null;
  if (approved) {
    // The article publish and the owner notification are independent: a failed
    // notification must not undo a published race, and vice versa.
    sheetKind = detectSheet(history, appState);
    if (typeof publish === 'function') {
      published = await publish({ messages: history, lang, application: appState }).catch(() => null);
    }
    if (typeof send === 'function') {
      const result = await send({
        kind: sheetKind,
        title: applicationTitle(appState, sheetKind, history),
        text: sheetText(history, appState),
        lang
      }).catch(() => null);
      delivered = Boolean(result && result.ok);
    }
  }
  // The player is told the sheet went to the owner. When delivery failed the line
  // says so and repeats the owner's contact, so an application is never lost to a
  // silent failure.
  const closing = approved ? sentToOwnerText('interview', lang, { delivered, kind: sheetKind }) : '';
  const handoff = handoffText('interview', lang, { approved, published, kind: sheetKind });
  return {
    reply: withEnd(approved ? `${clean}\n\n${closing}\n\n${handoff}` : clean),
    application: appState,
    published,
    delivered,
    source: by,
    finale: approved
  };
}

// The full sheet as plain text for the owner: the collected draft first, then the
// dialogue, so nothing the player wrote is lost even if they never used "add to
// the application".
function sheetText(history, application) {
  const app = application && typeof application === 'object' ? application : {};
  const fields = Object.entries(app)
    .filter(([k]) => !k.startsWith('note_'))
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
  const dialogue = history
    .filter((m) => m.role !== 'assistant')
    .map((m) => String(m.content || '').trim())
    .filter(Boolean);
  return [
    fields.length ? `Черновик анкеты:\n${fields.join('\n')}` : '',
    dialogue.length ? `Диалог:\n${dialogue.map((d) => `— ${d}`).join('\n')}` : ''
  ].filter(Boolean).join('\n\n');
}

export async function answerStaff({ messages = [], lang = 'ru', application = {}, notify = null } = {}) {
  const history = toHistory(messages, 30);
  const appState = application && typeof application === 'object' ? application : {};
  const send = typeof notify === 'function' ? notify : notifierFn;
  const turn = staffTurn(history, appState, lang);
  const local = () => localStaff({ messages: history, lang, application: appState });

  if (isEndCommand(lastUserText(history))) {
    return {
      reply: withEnd(finaleText('staff', lang, { approved: turn.done })),
      application: appState,
      role: turn.role?.key || null,
      done: true,
      finale: true
    };
  }

  if (!turn.role) {
    // Before a branch is chosen the only questions worth answering are the ones
    // the knowledge base actually holds an answer for.
    const faq = turn.askingQuestion ? matchActivityFaq(lastUserText(history)) : null;
    if (faq) {
      const { reply, by } = await askModelOrLocal([
        { role: 'system', content: `${STAFF_SYSTEM(lang)}\n\nКандидат задал уточняющий вопрос до выбора направления. Ответь на него коротко и дружелюбно, опираясь на факт ниже, затем задай вопрос о направлении.\nФАКТ: ${faq.a}` },
        ...history.map(asRole)
      ], () => local(), { temperature: 0.3, live: true, role: 'staff' });
      return { reply: withEnd(reply), application: appState, role: null, done: false, source: by };
    }
    return { reply: withEnd(turn.question), application: appState, role: null, done: false };
  }

  const { role, done } = turn;
  const questions = role.questions || [];
  const faq = turn.askingQuestion ? matchActivityFaq(lastUserText(history)) : null;

  // Every scripted question has been answered: close the interview with the fixed
  // hand-off instead of asking the model to improvise one. All the answers go to
  // the owner in one message, and the candidate is told they were sent.
  if (done && !faq) {
    let delivered = false;
    if (typeof send === 'function') {
      const result = await send({
        role: role.name,
        branch: role.key,
        answers: staffAnswerPairs(history, { ...appState, branch: role.key }, lang),
        verdict: 'РЕКОМЕНДОВАН',
        lang
      }).catch(() => null);
      delivered = Boolean(result && result.ok);
    }
    const closing = sentToOwnerText('staff', lang, { delivered });
    return {
      reply: withEnd(`${closing}\n\n${finaleText('staff', lang)}`),
      application: { ...appState, branch: role.key },
      role: role.key,
      done: true,
      delivered,
      finale: true
    };
  }

  const focus = [
    `НАПРАВЛЕНИЕ: ${role.name}. ${role.main}`,
    role.pace ? `ОБЫЧНАЯ АКТИВНОСТЬ: ${role.pace}` : '',
    `ВОПРОСЫ ПО ПОРЯДКУ: ${questions.map((q, i) => `${i + 1}) ${q}`).join(' ')}`,
    `Прогресс: задано ${turn.asked} из ${questions.length}.`,
    faq
      ? `КАНДИДАТ ЗАДАЛ УТОЧНЯЮЩИЙ ВОПРОС. Ответь дружелюбно и конкретно, опираясь на факт ниже, и НЕ считай это ответом на собеседование. Затем задай тот же вопрос заново: "${turn.question}"\nФАКТ ДЛЯ ОТВЕТА: ${faq.a}`
      : `ЗАДАНИЕ: коротко отреагируй на ответ кандидата и задай РОВНО ОДИН следующий вопрос: "${turn.question}". Больше ничего не добавляй.`
  ].filter(Boolean).join('\n');

  const { reply, by } = await askModelOrLocal([
    { role: 'system', content: `${STAFF_SYSTEM(lang)}\n\nТЕКУЩЕЕ ЗАДАНИЕ:\n${focus}\n\nЗапрещённые темы ещё раз: Discord, VK, Roll20, Foundry, настольные системы, возраст, город, часовой пояс, контакты, гранты.` },
    { role: 'user', content: `ЧЕРНОВАЯ ЗАЯВКА (JSON): ${JSON.stringify({ ...appState, branch: role.key })}` },
    ...history.map(asRole)
  ], () => local(), { temperature: 0.2, live: true, role: 'staff' });
  return {
    reply: withEnd(reply),
    application: { ...appState, branch: role.key },
    role: role.key,
    done,
    source: by
  };
}

