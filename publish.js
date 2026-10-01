// Tells an approved race or class sheet apart from a character sheet and from a
// plot. The site does not turn the sheet into an article: the owner publishes it
// in the blog, and the Races and Classes pages read that blog.

// A sheet counts as a race when it carries the race template's own fields, and as a
// class when it carries the class stat block. Plain character sheets match neither.
const RACE_MARKERS = [/самоназвание/i, /особые приметы/i, /уязвимост/i, /форма правления/i, /телосложение/i, /социальная структура/i];
const CLASS_MARKERS = [/роль\s*:/i, /ресурс\s*:/i, /\bHP\s*:/i, /\bХП\s*:/i, /уровень\s*\d/i, /базов\s*урон/i];
// A plot carries the GM template's own headings, which no character sheet has.
const STORY_MARKERS = [/название сюжета/i, /тэглайн|теглайн/i, /завязка/i, /крючок/i, /антагонист/i, /главная проблема/i, /развилк/i, /локаци/i, /NPC/i];
const RACE_INTENT = /созда[а-яё]*\s+(свою\s+)?расу|хочу\s+(свою\s+)?расу|свою\s+расу|своя\s+раса|новую\s+расу|новая\s+раса|new race|create a race|make a race/i;
const CLASS_INTENT = /созда[а-яё]*\s+(свой\s+)?класс|хочу\s+(свой\s+)?класс|свой\s+класс|новый\s+класс|new class|create a class|make a class/i;
const STORY_INTENT = /созда[а-яё]*\s+сюжет|заявк[а-яё]*\s+на\s+сюжет|придума[а-яё]*\s+сюжет|предложить\s+сюжет|мой\s+сюжет|сюжет\s+для\s+гм|new plot|create a plot|propose a plot/i;

const countMatches = (text, patterns) => patterns.filter((re) => re.test(text)).length;

export function detectSheetKind(messages, application = {}) {
  const convo = (Array.isArray(messages) ? messages : [])
    .map((m) => String(m?.content || ''))
    .join('\n');
  const app = application && typeof application === 'object' ? application : {};
  const state = JSON.stringify(app);
  const text = `${convo}\n${state}`;

  const raceScore = countMatches(text, RACE_MARKERS) + (RACE_INTENT.test(text) ? 2 : 0);
  const classScore = countMatches(text, CLASS_MARKERS) + (CLASS_INTENT.test(text) ? 2 : 0);
  const storyScore = countMatches(text, STORY_MARKERS) + (STORY_INTENT.test(text) ? 2 : 0);

  const best = Math.max(raceScore, classScore, storyScore);
  // The draft remembers the checklist the interviewer walked, so a thin sheet still
  // gets filed under the right heading even when its own markers are too few to score.
  if (best < 2) return ['race', 'class', 'story'].includes(app._kind) ? app._kind : null;
  // A tie is not guessed at: without a clear winner the sheet is left unpublished
  // rather than filed under the wrong heading.
  const winners = [
    ['class', classScore], ['race', raceScore], ['story', storyScore]
  ].filter(([, score]) => score === best);
  return winners.length === 1 ? winners[0][0] : null;
}
