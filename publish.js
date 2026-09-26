// Turns an approved race or class sheet into a site article. The model only formats
// the already-reviewed sheet; deciding whether the sheet passed stays in server.js.

// A sheet counts as a race when it carries the race template's own fields, and as a
// class when it carries the class stat block. Plain character sheets match neither.
const RACE_MARKERS = [/самоназвание/i, /особые приметы/i, /уязвимост/i, /форма правления/i, /телосложение/i, /социальная структура/i];
const CLASS_MARKERS = [/роль\s*:/i, /ресурс\s*:/i, /\bHP\s*:/i, /\bХП\s*:/i, /уровень\s*\d/i, /базов\s*урон/i];
// A plot carries the GM template's own headings, which no character sheet has.
const STORY_MARKERS = [/название сюжета/i, /тэглайн|теглайн/i, /завязка/i, /крючок/i, /антагонист/i, /главная проблема/i, /развилк/i, /локаци/i, /NPC/i];
const RACE_INTENT = /создать\s+(свою\s+)?расу|свою расу|придумать расу|new race|create a race/i;
const CLASS_INTENT = /создать\s+(свой\s+)?класс|свой класс|придумать класс|new class|create a class/i;
const STORY_INTENT = /создать\s+сюжет|заявк\w*\s+на\s+сюжет|придумать\s+сюжет|предложить\s+сюжет|мой\s+сюжет|сюжет\s+для\s+гм|new plot|create a plot|propose a plot/i;

const countMatches = (text, patterns) => patterns.filter((re) => re.test(text)).length;

export function detectSheetKind(messages, application = {}) {
  const convo = (Array.isArray(messages) ? messages : [])
    .map((m) => String(m?.content || ''))
    .join('\n');
  const state = JSON.stringify(application || {});
  const text = `${convo}\n${state}`;

  const raceScore = countMatches(text, RACE_MARKERS) + (RACE_INTENT.test(text) ? 2 : 0);
  const classScore = countMatches(text, CLASS_MARKERS) + (CLASS_INTENT.test(text) ? 2 : 0);
  const storyScore = countMatches(text, STORY_MARKERS) + (STORY_INTENT.test(text) ? 2 : 0);

  const best = Math.max(raceScore, classScore, storyScore);
  if (best < 2) return null;
  // A tie is not guessed at: without a clear winner the sheet is left unpublished
  // rather than filed under the wrong heading.
  const winners = [
    ['class', classScore], ['race', raceScore], ['story', storyScore]
  ].filter(([, score]) => score === best);
  return winners.length === 1 ? winners[0][0] : null;
}

function parseArticleJson(raw) {
  const text = String(raw || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1));
    const title = String(obj.title || '').trim();
    const body = String(obj.text || obj.article || '').trim();
    if (!title || !body) return null;
    return { title, text: body };
  } catch {
    return null;
  }
}

function articleSystemPrompt(kind, lang, knowledge) {
  const raceRules = (knowledge?.races?.race_template_rules || []).join(' ');
  const classRules = (knowledge?.classes?.class_balance_rules || []).join(' ');
  const what = kind === 'race' ? 'расу' : 'класс';
  const rules = kind === 'race' ? raceRules : classRules;
  return `Ты редактор вики чата Deeprealm. Игрок придумал ${what} и прошёл проверку у анкетолога.
Твоя задача — оформить уже проверенную анкету в статью для сайта. НИЧЕГО не выдумывай и не добавляй от себя: только приведи в порядок и структурируй то, что есть в диалоге.

ТРЕБОВАНИЯ:
1. Заголовок — короткое название ${kind === 'race' ? 'расы' : 'класса'}.
2. Текст — аккуратно оформленное описание: заголовки разделов, списки, характеристики. Без markdown-звёздочек, без ссылок.
3. Сохрани все числа, способности, уязвимости и ограничения ровно как в анкете. Если чего-то не хватает — не придумывай, пропусти этот раздел.
4. Пиши на ${lang === 'en' ? 'английском' : 'русском'} языке.
5. Правила баланса чата: ${rules}

Отвечай ТОЛЬКО JSON без пояснений:
{"title": "...", "text": "..."}`;
}

export async function buildArticle({ kind, messages, lang, knowledge, callLLM }) {
  const convo = (Array.isArray(messages) ? messages : [])
    .filter((m) => m?.role !== 'system')
    .map((m) => `${m.role === 'assistant' ? 'Анкетолог' : 'Игрок'}: ${String(m.content || '')}`)
    .join('\n\n');
  const raw = await callLLM([
    { role: 'system', content: articleSystemPrompt(kind, lang, knowledge) },
    { role: 'user', content: `Диалог с анкетологом:\n\n${convo}` }
  ]);
  return parseArticleJson(raw);
}
