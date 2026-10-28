// The bot's menu: the sections reachable from /menu (and /start).
//
//   1. Боевые правила            - the turn economy, resolution, mana
//   2. Правила написания поста в бою - who rolls, /roll1|2, /rollall, the post shape
//   3. Фишки статистик           - what each characteristic unlocks at 10
//   4. Кубик и команды           - how the d20 works and the commands that call it
//
// The section text is built from the same COMBAT and FEATS data the engine uses,
// so the menu cannot describe rules the dice do not follow. Telegram inline
// keyboards carry a callback_data of the form `menu:<section>`, which the bot
// turns back into one of these sections.

import { COMBAT, BONUS_RULE } from './rules/combat.js';
import { FEATS } from './rules/feats.js';
import { STATS, DISTRIBUTION_RULE } from './stats.js';

export const MENU = [
  { key: 'rules', ru: '⚔️ Боевые правила' },
  { key: 'post', ru: '📝 Пост в бою' },
  { key: 'feats', ru: '✨ Фишки статистик' },
  { key: 'dice', ru: '🎲 Кубик и команды' }
];

const SECTION_KEYS = new Set(MENU.map((m) => m.key));

export function isMenuSection(key) {
  return SECTION_KEYS.has(String(key || ''));
}

export function homeText() {
  return [
    '🎲 Кубик Deeprealm',
    '',
    'Выбери раздел:',
    ...MENU.map((m) => `• ${m.ru.replace(/^[^\wа-яё]+\s*/i, '')}`)
  ].join('\n');
}

export function rulesText() {
  const lines = ['⚔️ Боевые правила', ''];
  lines.push(COMBAT.playerRolls);
  lines.push('');
  lines.push('За ход — на выбор:');
  lines.push(`• атака и ${COMBAT.turn.attack.partial} неполных действия;`);
  lines.push(`• без атаки — ${COMBAT.turn.noAttack.partial} неполных действия.`);
  lines.push('Полное: ' + COMBAT.turn.fullActions.map((a) => a.ru).join(', ') + '.');
  lines.push('Неполное: ' + COMBAT.turn.partialActions.map((a) => a.ru).join(', ') + '.');
  lines.push('', 'Разрешение атаки:');
  COMBAT.resolution.forEach((r, i) => lines.push(`${i + 1}. ${r}`));
  lines.push('', COMBAT.dice.crit.ru);
  lines.push(COMBAT.dice.block.ru);
  lines.push('', BONUS_RULE);
  lines.push('', COMBAT.grid.move);
  lines.push(COMBAT.grid.diagonal);
  lines.push(COMBAT.grid.cover);
  lines.push('', COMBAT.conditional);
  lines.push('', `💧 ${COMBAT.mana.ru}: ${COMBAT.mana.note}`);
  lines.push('', `📝 Как писать пост в бою — раздел «${COMBAT.post.ru}».`);
  return lines.join('\n');
}

// The battle-post rules, including which character a /rollN is for.
export function postText() {
  const lines = [`📝 ${COMBAT.post.ru}`, ''];
  lines.push(COMBAT.playerRolls);
  lines.push('');
  for (const line of COMBAT.post.lines) lines.push('• ' + line);
  lines.push('');
  lines.push('Примеры:');
  lines.push('• «Атакую гоблина мечом /roll1» — бросок за первого персонажа.');
  lines.push('• «Атакую; если выпал крит. Урон, использую ваша способность /roll2» — бросок за второго.');
  lines.push('• «Атакую за обоих /rollall» — броски за обоих сразу, одним сообщением.');
  return lines.join('\n');
}

export function featsText(record) {
  const name = record && record.name ? `${record.slot ? record.slot + '. ' : ''}${record.name}` : '';
  const lines = ['✨ Фишки статистик', '', 'Фишка открывается только на характеристику 10.'];
  if (name) lines.push('', `Персонаж: ${name}`);
  lines.push('');
  if (record && record.stats) {
    const mine = STATS.filter((s) => FEATS[s.key] && Number(record.stats[s.key]) >= 10);
    lines.push('Твои открытые:');
    lines.push(mine.length
      ? mine.map((s) => `• ${s.ru} — «${FEATS[s.key].name}»`).join('\n')
      : '• пока нет — нужна характеристика 10');
    lines.push('');
  }
  lines.push('Все фишки:');
  for (const s of STATS) {
    const f = FEATS[s.key];
    if (!f) continue;
    lines.push('', `• ${s.ru} — «${f.name}»`, f.text);
  }
  return lines.join('\n');
}

export function diceText() {
  const d = COMBAT.dice;
  const fumbleRange = d.crit.fumble >= d.crit.crit ? String(d.crit.fumble) : `1–${d.crit.fumble}`;
  return [
    '🎲 Кубик и команды',
    '',
    `Кубик: d${d.die}. Бросок = выпавшее число + половина характеристики (округление вниз).`,
    '',
    'Три броска за раз:',
    '• Крит-урон — от Силы. 19–20 даёт урон ×2.',
    `• Блок — от Силы. ${d.block.full}+ полный (нужен щит), ${d.block.partial}–${d.block.full - 1} частичный (урон пополам).`,
    '• Уклонение — от Реакции. Успех — атака промахнулась.',
    '',
    'Всё это — крит, уклонение и блок — бросается одной твоей командой. Отдельно защиту кидать не нужно: уклонение и блок тоже твои.',
    '',
    `Провал: ${fumbleRange} — по тебе +5 до конца раунда.`,
    '',
    'Кубик кидает только игрок — за своего персонажа. Бот не бросает за врагов или НПС.',
    '',
    'Команды:',
    '• /roll1 или /roll2 — в игровом чате: закончи пост, и я брошу за первого или второго. Если персонаж ничего не делает (например, сидит в укрытии), бросок не нужен.',
    '• /rollall — броски за всех персонажей сразу, одним сообщением.',
    '• /reg — в личке: записать персонажа (имя, @юзер и 14 характеристик). Можно двоих.',
    '  Правило характеристик: в каждом блоке — ' + DISTRIBUTION_RULE + '.',
    '• /del 1 | /del 2 | /delall — удалить персонажа (в личке).',
    '• /my — мои листы, /feats — мои фишки.',
    '• /menu — это меню, /rules — правила боя, /post — правила поста в бою.',
    '',
    'В посте можно дописать: «атакую; если выпал крит. Урон, использую ваша способность» — бот применит это только при крите.'
  ].join('\n');
}

// The text for a section, or the home screen for anything else.
export function sectionText(key, record) {
  if (key === 'rules') return rulesText();
  if (key === 'post') return postText();
  if (key === 'feats') return featsText(record);
  if (key === 'dice') return diceText();
  return homeText();
}

// The inline keyboard. `active` marks the open section and adds a "back" row.
export function menuKeyboard(active = null) {
  const rows = MENU.map((m) => [{
    text: (active === m.key ? '• ' : '') + m.ru,
    callback_data: 'menu:' + m.key
  }]);
  if (active) rows.push([{ text: '⬅️ Назад', callback_data: 'menu:home' }]);
  return { inline_keyboard: rows };
}
