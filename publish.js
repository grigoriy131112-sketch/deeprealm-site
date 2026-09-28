// Tells an approved race or class sheet apart from a character sheet and from a
// plot. The site does not turn the sheet into an article: the owner publishes it
// in the blog, and the Races and Classes pages read that blog.

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
