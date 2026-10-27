// The combat rules the bot knows and can print.
//
// These are plain data so the numbers live in one place: the dice module reads
// the crit and block thresholds from here, and `/rules` prints the same object,
// so what the bot says and what the bot does cannot drift apart.

export const COMBAT = {
  // One full action and two partial ones per turn. An attack is the only full
  // action; everything else on the list is partial and may be taken twice.
  turn: {
    full: 1,
    partial: 2,
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

  // An attack always lands; the dice only answer these three questions.
  resolution: [
    'Атака объявляется в досягаемости и попадает автоматически — броска на попадание нет.',
    'Защитник бросает уклонение. Успех — промах, урон 0.',
    'Атакующий бросает крит. 19–20 — урон ×2.',
    'Защитник бросает блок. 18+ — урон 0 (нужен щит), 12–17 — урон пополам.',
    'Если крит удался — тот, кто его нанёс, делает одну контр-атаку (один раз, без цепочки).'
  ],

  dice: {
    die: 20,
    crit: { crit: 19, fumble: 1, multiplier: 2, ru: 'Крит: 19–20, урон ×2. Провал: 1 — по тебе +5 до конца раунда.' },
    block: {
      full: 18,
      partial: 12,
      ru: 'Блок: 18+ — полный (0 урона, только со щитом), 12–17 — частичный (урон пополам), ниже — блок не удался.'
    }
  },

  grid: {
    cell: '1 клетка ≈ 1,5 м',
    move: 'За неполное действие — до 2 клеток без груза, 1 клетка с грузом; оба неполных слота можно отдать движению.',
    diagonal: 'Диагональ считается как одна клетка.',
    cover: 'Половинное укрытие — +3 к уклонению; полное — нельзя выбрать целью.'
  },

  // The conditional a player may attach to a post: "attack; if crit, I use X".
  // The bot remembers it and fires it only when the crit roll lands.
  conditional: 'В посте можно написать: «атакую; если крит — использую добивание». Бот применит это только если крит удался.'
};

// Half of the rating, rounded down, is the only bonus that reaches a roll.
export const BONUS_RULE = 'Плюс к броску = половина характеристики, округление вниз (Сила 8 → +4, Реакция 5 → +2).';
