// The three chat handlers live here rather than in the server, so the browser can
// run the very same rules when no server is reachable. Only the model call and
// the article publishing are injected, because those differ per environment.
import {
  withEnd, stripMarkdown, finaleText, isEndCommand, approvedWithSheet, handoffText,
  staffTurn, matchActivityFaq, GUIDE_SYSTEM, INTERVIEWER_SYSTEM, STAFF_SYSTEM
} from './chat-core.js';

let modelCaller = null;
export function setModelCaller(fn) { modelCaller = typeof fn === 'function' ? fn : null; }

function callModel(messages, options) {
  if (!modelCaller) throw new Error('model caller is not configured');
  return modelCaller(messages, options);
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
  const reply = await callModel([
    { role: 'system', content: GUIDE_SYSTEM(lang) },
    ...history.map(asRole)
  ]);
  return { reply: withEnd(stripMarkdown(reply)) };
}

export async function answerInterview({ messages = [], lang = 'ru', application = {}, publish = null } = {}) {
  const history = toHistory(messages, 30);
  const appState = application && typeof application === 'object' ? application : {};
  if (isEndCommand(lastUserText(history))) {
    return { reply: withEnd(finaleText('interview', lang)), application: appState, finale: true };
  }
  const reply = await callModel([
    { role: 'system', content: INTERVIEWER_SYSTEM(lang) },
    { role: 'system', content: `ТЕКУЩАЯ ЧЕРНОВАЯ АНКЕТА (JSON): ${JSON.stringify(appState)}` },
    ...history.map(asRole)
  ]);
  const clean = stripMarkdown(reply);
  // The model's own "ОДОБРЕНО" means the check passed; the fixed hand-off is attached
  // so the destination and the owner's username are never paraphrased.
  const approved = approvedWithSheet(clean, history, appState);
  let published = null;
  if (approved && typeof publish === 'function') {
    published = await publish({ messages: history, lang, application: appState }).catch(() => null);
  }
  const handoff = handoffText('interview', lang, { approved, published });
  return {
    reply: withEnd(approved ? `${clean}\n\n${handoff}` : clean),
    application: appState,
    published,
    finale: approved
  };
}

export async function answerStaff({ messages = [], lang = 'ru', application = {} } = {}) {
  const history = toHistory(messages, 30);
  const appState = application && typeof application === 'object' ? application : {};
  const turn = staffTurn(history, appState, lang);

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
      const reply = await callModel([
        { role: 'system', content: `${STAFF_SYSTEM(lang)}\n\nКандидат задал уточняющий вопрос до выбора направления. Ответь на него коротко и дружелюбно, опираясь на факт ниже, затем задай вопрос о направлении.\nФАКТ: ${faq.a}` },
        ...history.map(asRole)
      ], { temperature: 0.3 });
      return { reply: withEnd(stripMarkdown(reply)), application: appState, role: null, done: false };
    }
    return { reply: withEnd(turn.question), application: appState, role: null, done: false };
  }

  const { role, asked, done } = turn;
  const questions = role.questions || [];
  const faq = turn.askingQuestion ? matchActivityFaq(lastUserText(history)) : null;

  // Every scripted question has been answered: close the interview with the fixed
  // hand-off instead of asking the model to improvise one.
  if (done && !faq) {
    return {
      reply: withEnd(finaleText('staff', lang)),
      application: { ...appState, branch: role.key },
      role: role.key,
      done: true,
      finale: true
    };
  }

  const focus = [
    `НАПРАВЛЕНИЕ: ${role.name}. ${role.main}`,
    role.pace ? `ОБЫЧНАЯ АКТИВНОСТЬ: ${role.pace}` : '',
    `ВОПРОСЫ ПО ПОРЯДКУ: ${questions.map((q, i) => `${i + 1}) ${q}`).join(' ')}`,
    `Прогресс: задано ${asked} из ${questions.length}.`,
    faq
      ? `КАНДИДАТ ЗАДАЛ УТОЧНЯЮЩИЙ ВОПРОС. Ответь дружелюбно и конкретно, опираясь на факт ниже, и НЕ считай это ответом на собеседование. Затем задай тот же вопрос заново: "${turn.question}"\nФАКТ ДЛЯ ОТВЕТА: ${faq.a}`
      : `ЗАДАНИЕ: коротко отреагируй на ответ кандидата и задай РОВНО ОДИН следующий вопрос: "${turn.question}". Больше ничего не добавляй.`
  ].filter(Boolean).join('\n');

  const reply = await callModel([
    { role: 'system', content: `${STAFF_SYSTEM(lang)}\n\nТЕКУЩЕЕ ЗАДАНИЕ:\n${focus}\n\nЗапрещённые темы ещё раз: Discord, VK, Roll20, Foundry, настольные системы, возраст, город, часовой пояс, контакты, гранты.` },
    { role: 'user', content: `ЧЕРНОВАЯ ЗАЯВКА (JSON): ${JSON.stringify({ ...appState, branch: role.key })}` },
    ...history.map(asRole)
  ], { temperature: 0.2 });
  return {
    reply: withEnd(stripMarkdown(reply)),
    application: { ...appState, branch: role.key },
    role: role.key,
    done
  };
}
