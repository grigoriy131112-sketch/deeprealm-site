/* =========================================================================
   ДРЕВО ЗНАНИЙ · три ветки заклинаний по 15 узлов в каждой.

   Узлы выстроены в линию: каждый следующий требует предыдущий. Покупаются
   за очки знаний (S.kp) — они капают с убитых тварей, Владык, новых
   уровней и сундуков. Изученное хранится в S.kn = { fireball: 4, ... }.
   Названия и описания лежат в i18n.js (KN_T и kt.<шаг>.d), здесь — только
   механика. Эффекты читает game.js через window.KNOWLEDGE.
   ========================================================================= */
window.KNOWLEDGE = (function () {
  const BRANCHES = ['fireball', 'frost', 'bolt'];
  const MAX = 15;

  /* Шаг узла: что он даёт. Поля:
     magicPower / dmgMul  — сила школы и множитель урона именно этого каста;
     cdPct                — быстрее перезарядка; costPct — дешевле каст;
     crit / critDmg       — шанс и сила крита только у этой школы;
     mpPct / manaRegen    — запас и восстановление маны;
     spellHeal            — доля урона, возвращаемая здоровьем;
     echo                 — отголосок: каст бьёт повторно долей силы;
     shred                — сколько сопротивления срезает каждый каст;
     dotMult / dotTime    — поджог: урон в секунду и его длительность;
     crown                — завершающий дар: усиливает всё сразу. */
  const STEPS = [
    { magicPower: 0.05 },
    { dmgMul: 0.10 },
    { cdPct: 0.07 },
    { costPct: 0.08 },
    { crit: 0.04 },
    { magicPower: 0.08 },
    { critDmg: 0.25 },
    { mpPct: 0.12 },
    { dmgMul: 0.15 },
    { spellHeal: 0.04 },
    { cdPct: 0.10, manaRegen: 0.5 },
    { shred: 0.05 },
    { dotMult: 0.30, dotTime: 3 },
    { doubleChance: 0.10 },
    { crown: 1 }
  ];

  /* Цена растёт с номером узла: первые шаги доступны почти сразу,
     венец — уже серьёзная цель. */
  const cost = i => 2 + i * 2;

  const isBranch = b => BRANCHES.indexOf(b) >= 0;
  const lvl = (state, b) => (state.kn && state.kn[b]) || 0;
  /* следующий узел открыт, если изучены все предыдущие. Венец ветки (15-й
     узел) — единственное исключение: его берут за очки знаний, а не за
     уровень заклинания, иначе ветку нельзя было бы закрыть до прокачки. */
  const canBuy = (state, b, i) => isBranch(b) && i === lvl(state, b) && i < MAX && (state.kp || 0) >= cost(i);

  /* Итоговые бонусы ветки: считается один раз за кадр боя. */
  function sum(state, b) {
    const o = {
      magicPower: 0, dmgMul: 0, cdPct: 0, costPct: 0, crit: 0, critDmg: 0,
      mpPct: 0, manaRegen: 0, spellHeal: 0, shred: 0,
      dotMult: 0, dotTime: 0, echo: 0, doubleChance: 0, crown: false
    };
    const n = Math.min(lvl(state, b), MAX);
    for (let i = 0; i < n; i++) {
      const s = STEPS[i];
      for (const k in s) {
        if (k === 'crown') o.crown = true;
        else o[k] += s[k];
      }
    }
    /* венец ветки: сила, мощь, крит и отголосок разом — награда за все 15 узлов */
    if (o.crown) {
      o.magicPower += 0.20; o.dmgMul += 0.25; o.crit += 0.05; o.critDmg += 0.50;
      o.echo += 0.35;
    }
    return o;
  }

  /* Покупка узла: списывает очки, возвращает true, если узел изучен. */
  function buy(state, b, i) {
    if (!canBuy(state, b, i)) return false;
    state.kp -= cost(i);
    state.kn[b] = lvl(state, b) + 1;
    return true;
  }

  /* Очки знаний за события. Владыка даёт больше: он и должен быть целью. */
  const reward = { kill: 1, boss: 3, level: 2, chest: 2 };

  return { BRANCHES, MAX, STEPS, cost, lvl, canBuy, buy, sum, reward, isBranch };
})();
