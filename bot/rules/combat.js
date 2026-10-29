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
    'Уклонение бросает сам игрок — тем же /roll. Успех (16–20) — промах, урон 0.',
    'Крит-урон бросает сам игрок: 0–5 — промах, по тебе +5 до конца раунда; 6–9 — промах; 10–12 — половина урона; 13–18 — обычная атака; 19–20 — крит, урон ×2.',
    'Блок бросает сам игрок — тем же /roll. 18–20 — урон 0 (нужен щит), 16–17 — урон пополам.',
    'Если крит удался — тот, кто его нанёс, делает одну контр-атаку (один раз, без цепочки).'
  ],

  dice: {
    // 21 values, 0 through 20, so a 0 can come up.
    die: 21,
    // The general band for dodge and block: 0–15 is a failure, 16–20 a success.
    // The crit roll splits this further (see `crit` below).
    band: 'Бросок — 0–20 плюс половина характеристики: 0–15 — провал, 16–20 — успех.',
    // The owner's crit-damage bands, read on the total: 0–5 a fumble that costs
    // you +5 for the round, 6–9 a plain miss, 10–12 half damage, 13–18 an ordinary
    // hit, 19–20 a crit that doubles the damage. Each field is the lower bound of
    // its band; `miss` and up are also the boundary the band above ends at.
    crit: {
      fumble: 5,
      miss: 6,
      half: 10,
      hit: 13,
      crit: 19,
      multiplier: 2,
      ru: 'Крит-урон: 0–5 — промах, по тебе +5 до конца раунда; 6–9 — промах; 10–12 — половина урона; 13–18 — обычная атака; 19–20 — крит, урон ×2.'
    },
    dodge: { success: 16, ru: 'Уклонение: 16–20 — успех, атака промахнулась (урон 0); 0–15 — не удалось.' },
    block: {
      full: 18,
      partial: 16,
      success: 16,
      ru: 'Блок: 16–17 — частичный (урон пополам), 18–20 — полный (0 урона, только со щитом); 0–15 — блок не удался.'
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
