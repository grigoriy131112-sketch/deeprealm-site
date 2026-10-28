// The combat rules the bot knows and can print.
//
// These are plain data so the numbers live in one place: the dice module reads
// the crit and block thresholds from here, and `/rules` prints the same object,
// so what the bot says and what the bot does cannot drift apart.

export const COMBAT = {
  // A turn takes one of two shapes: attack and then use two partial actions, or
  // give up the attack and use three partial ones instead. A turn never has both
  // a full action and three partial actions.
  turn: {
    attack: { full: 1, partial: 2 },
    noAttack: { full: 0, partial: 3 },
    fullActions: [
      { key: 'attack', ru: 'Атака', note: 'одна атака за ход' }
    ],
    partialActions: [
      { key: 'equip', ru: 'Смена оружия / экипировки' },
      { key: 'consume', ru: 'Питьё зелья или еды' },
      { key: 'track', ru: 'Слежение / осмотр' },
      { key: 'move', ru: 'Переход на клетки', note: 'до 2 клеток без груза, 1 с грузом' }
    ]
  },

  // An attack always lands; the dice only answer these three questions. All
  // three dice come from the player's own command - the same /roll1, /roll2 or
  // /rollall - so it is the player who rolls dodge and block, not some separate
  // defender.
  resolution: [
    'Атака объявляется в досягаемости и попадает автоматически — броска на попадание нет.',
    'Уклонение бросает сам игрок — тем же /roll. Успех — промах, урон 0.',
    'Крит-урон бросает сам игрок. 19–20 — урон ×2.',
    'Блок бросает сам игрок — тем же /roll. 18+ — урон 0 (нужен щит), 12–17 — урон пополам.',
    'Если крит удался — тот, кто его нанёс, делает одну контр-атаку (один раз, без цепочки).'
  ],

  dice: {
    die: 20,
    crit: { crit: 19, fumble: 10, multiplier: 2, ru: 'Крит-урон: 1–10 — провал, по тебе +5 до конца раунда; 11–18 — обычная атака, просто урон; 19–20 — крит, урон ×2.' },
    block: {
      full: 18,
      partial: 12,
      ru: 'Блок: 18+ — полный (0 урона, только со щитом), 12–17 — частичный (урон пополам), ниже — блок не удался.'
    }
  },

  grid: {
    cell: '1 клетка ≈ 1,5 м',
    move: 'За неполное действие — до 2 клеток без груза, 1 клетка с грузом; неполные действия можно отдать движению.',
    diagonal: 'Диагональ считается как одна клетка.',
    cover: 'Половинное укрытие — +3 к уклонению; полное — нельзя выбрать целью.'
  },

  // The conditional a player may attach to a post: "attack; if the crit lands,
  // I use my spell". The player writes "ваше заклинание" instead of naming it,
  // so the bot does not have to know it.
  conditional: 'В посте можно написать: «атакую; если выпал крит. Урон, использую ваше заклинание». Бот применит это только если крит удался.',

  // Who rolls: the bot rolls only for a player, never for an NPC or the world.
  // The player calls it with /roll1, /roll2 or /rollall, and a battle post ends
  // on one of those. All three dice - crit, dodge and block - come from that one
  // command, so the player rolls their own defence too.
  playerRolls: 'Кубик кидает только игрок — за себя, командуя своим персонажем. Одной командой /roll1, /roll2 или /rollall он бросает сразу всё: крит, уклонение и блок. Бот не бросает за врагов, НПС или мир — он лишь отвечает на твою команду.',

  // How to write a battle post: one roll command per turn, naming the character.
  post: {
    ru: 'Правила написания поста в бою',
    lines: [
      'Пиши от лица одного персонажа за ход — того, чей номер укажешь.',
      'За ход — либо атака и 2 неполных действия, либо 3 неполных действия без атаки.',
      'Бросай, только когда персонаж действует: атакует или защищается. Один бросок — один ход.',
      'Если персонаж просто описывает, где он и что делает без броска — например, сидит в укрытии — бросок не нужен.',
      'Одна команда бросает сразу всё: крит, уклонение и блок. Отдельно их кидать не нужно.',
      'За обоих сразу — /rollall: бот бросит за каждого, одним сообщением.',
      'Голый /roll не кидает: номер нужен, чтобы бот понял, чей это ход.',
      'Условие на крит пишется в посте: «атакую; если выпал крит. Урон, использую ваше заклинание». Бот применит его только при крите.'
    ]
  },

  // Mana is a resource, not a characteristic: it is spent to act and refilled by
  // skipping an attack.
  mana: {
    ru: 'Мана',
    skip: 5,
    note: 'ресурс, тратится на действия. Пропуск атаки восстанавливает 5 маны.'
  }
};

// Half of the rating, rounded down, is the only bonus that reaches a roll.
export const BONUS_RULE = 'Плюс к броску = половина характеристики, округление вниз (Сила 8 → +4, Реакция 5 → +2).';
