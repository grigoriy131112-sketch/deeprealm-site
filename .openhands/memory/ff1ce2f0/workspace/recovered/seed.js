import { getDb, transaction } from './index.js';
import { travelMinutes } from '../game/travel.js';

// A grim-dark world: a dying continent, its blighted regions, and the things
// that wait in them. Each location lists outgoing roads by name.

const WORLD = [
  {
    name: 'Мордрат',
    description: 'Расколотое королевство. Континент под небом цвета старых синяков, где мёртвые не всегда остаются в земле.',
    regions: [
      {
        name: 'Пепельный предел',
        description: 'Поля серой пыли, где отгремела война, которую никто не помнит.',
        locations: [
          { name: 'Перекрёсток висельников', description: 'Перекрёсток, отмеченный виселицей, что никогда не пустовала.', danger: 1, safe: true, biome: 'waste', scene: 'crossroads', x: 180, y: 360, connects: ['Плачущая низина', 'Утонувшая дорога'] },
          { name: 'Плачущая низина', description: 'Ложбина, задушенная туманом, что глотает и звук, и свет.', danger: 2, biome: 'marsh', scene: 'hollow', x: 240, y: 240, connects: ['Перекрёсток висельников', 'Пепельный лес'] },
          { name: 'Утонувшая дорога', description: 'Затонувшая гать, где болото поглотило королевский тракт.', danger: 2, biome: 'marsh', scene: 'drowned_road', x: 300, y: 440, connects: ['Перекрёсток висельников', 'Затонувшая часовня', 'Сумеречная гавань'] },
          { name: 'Пепельный лес', description: 'Обгоревшие деревья, всё ещё тёплые на ощупь спустя годы после пожара.', danger: 3, biome: 'forest', scene: 'ash_forest', x: 430, y: 330, connects: ['Плачущая низина', 'Костяные поля'] },
        ],
      },
      {
        name: 'Костяной берег',
        description: 'Берег меловых утёсов и оссуариев, где море отдаёт кости вместо ракушек.',
        locations: [
          { name: 'Сумеречная гавань', description: 'Порт, освещённый фонарями, торгующий обломками и секретами.', danger: 1, safe: true, biome: 'coast', scene: 'harbor', x: 470, y: 170, connects: ['Утонувшая дорога', 'Пещеры, изгрызенные приливом'] },
          { name: 'Пещеры, изгрызенные приливом', description: 'Морские пещеры, увешанные останками тех, кого забрал прилив.', danger: 3, biome: 'coast', scene: 'tide_caves', x: 700, y: 340, connects: ['Сумеречная гавань', 'Затонувшая часовня', 'Костяные поля'] },
          { name: 'Затонувшая часовня', description: 'Затопленная часовня богу, что утонул вместе со своим стадом.', danger: 4, biome: 'coast', scene: 'sunken_chapel', x: 470, y: 500, connects: ['Утонувшая дорога', 'Пещеры, изгрызенные приливом'] },
          { name: 'Костяные поля', description: 'Равнина выбеленных останков, где земля так и не зажила.', danger: 4, biome: 'bonefield', scene: 'bone_field', x: 640, y: 520, connects: ['Пепельный лес', 'Пещеры, изгрызенные приливом', 'Чёрный шпиль'] },
          { name: 'Чёрный шпиль', description: 'Игла обсидиана, что гудит звуком, похожим на жужжание мух.', danger: 5, biome: 'waste', scene: 'black_spire', x: 820, y: 470, connects: ['Костяные поля'] },
        ],
      },
    ],
  },
];

const MONSTERS = [
  { name: 'Могильная крыса', description: 'Раздутая крыса, отъевшаяся на трупах.', level: 1, max_hp: 22, attack: 7, defense: 2, accuracy: 22, evasion: 8, speed: 9, mana: 0, stamina: 0, class_key: 'fighter', xp_reward: 25, gold_reward: 3 },
  { name: 'Пустой крестьянин', description: 'Селянин, в чьих глазах остался один лишь голод.', level: 1, max_hp: 26, attack: 8, defense: 3, accuracy: 20, evasion: 5, speed: 6, mana: 0, stamina: 0, class_key: 'fighter', xp_reward: 30, gold_reward: 5 },
  { name: 'Фонарный упырь', description: 'Утонувший моряк, несущий холодное зелёное пламя.', level: 2, max_hp: 34, attack: 11, defense: 4, accuracy: 26, evasion: 8, speed: 7, mana: 20, stamina: 0, class_key: 'wizard', xp_reward: 55, gold_reward: 12 },
  { name: 'Терновый охотник', description: 'Клубок шипастых конечностей, что охотится по запаху.', level: 2, max_hp: 30, attack: 12, defense: 3, accuracy: 28, evasion: 12, speed: 11, mana: 0, stamina: 40, class_key: 'rogue', xp_reward: 55, gold_reward: 8 },
  { name: 'Костяной рыцарь', description: 'Доспех, движимый обидой, всё ещё верный мёртвому сюзерену.', level: 3, max_hp: 52, attack: 15, defense: 8, accuracy: 28, evasion: 6, speed: 7, mana: 0, stamina: 60, class_key: 'fighter', xp_reward: 95, gold_reward: 25 },
  { name: 'Призрак хора', description: 'Хор проклятых, поющий одним сломанным голосом.', level: 3, max_hp: 46, attack: 16, defense: 5, accuracy: 32, evasion: 14, speed: 10, mana: 50, stamina: 0, class_key: 'wizard', xp_reward: 95, gold_reward: 20 },
  { name: 'Колосс костяных полей', description: 'Холм из сросшихся скелетов, что встаёт и идёт.', level: 4, max_hp: 80, attack: 20, defense: 10, accuracy: 30, evasion: 5, speed: 6, mana: 0, stamina: 80, class_key: 'fighter', xp_reward: 150, gold_reward: 45 },
  { name: 'Вестник чумы', description: 'Фигура в балахоне, чьё дыхание обращает плоть в гниль.', level: 4, max_hp: 64, attack: 18, defense: 7, accuracy: 34, evasion: 12, speed: 9, mana: 70, stamina: 0, class_key: 'cleric', xp_reward: 150, gold_reward: 40 },
  { name: 'Хранитель шпиля', description: 'То, что держит дверь Чёрного шпиля запертой.', level: 5, max_hp: 120, attack: 24, defense: 13, accuracy: 34, evasion: 10, speed: 9, mana: 60, stamina: 60, class_key: 'cleric', xp_reward: 260, gold_reward: 90 },
  { name: 'Полый король', description: 'Коронован, восседает и совершенно пуст — если не считать мух.', level: 5, max_hp: 140, attack: 26, defense: 12, accuracy: 36, evasion: 12, speed: 11, mana: 40, stamina: 80, class_key: 'fighter', xp_reward: 320, gold_reward: 150 },
];

const SPAWNS = {
  'Плачущая низина': ['Могильная крыса', 'Пустой крестьянин', 'Терновый охотник'],
  'Утонувшая дорога': ['Пустой крестьянин', 'Могильная крыса', 'Фонарный упырь'],
  'Пепельный лес': ['Терновый охотник', 'Пустой крестьянин', 'Призрак хора'],
  'Пещеры, изгрызенные приливом': ['Фонарный упырь', 'Костяной рыцарь', 'Могильная крыса'],
  'Затонувшая часовня': ['Фонарный упырь', 'Призрак хора', 'Вестник чумы'],
  'Костяные поля': ['Костяной рыцарь', 'Колосс костяных полей', 'Призрак хора'],
  'Чёрный шпиль': ['Хранитель шпиля', 'Полый король', 'Колосс костяных полей'],
};

// Existing databases predate the map columns; fill them in from the source
// world definition without touching anything the player has changed.
function backfillMap() {
  const rows = WORLD.flatMap((c) => c.regions).flatMap((r) => r.locations);
  transaction((d) => {
    const stmt = d.prepare('UPDATE locations SET map_x=?, map_y=?, scene=?, biome=? WHERE name=?');
    rows.forEach((l) => stmt.run(l.x ?? null, l.y ?? null, l.scene ?? null, l.biome ?? null, l.name));
  });
}

// Travel time is derived from the drawn map, so it is recomputed (not stored in
// the world definition) and written for every road, including old databases.
function backfillTravel() {
  const d = getDb();
  const rows = d.prepare(
    `SELECT c.id, a.map_x ax, a.map_y ay, a.biome ab, a.danger ad,
            b.map_x bx, b.map_y by, b.biome bb, b.danger bd
     FROM connections c
     JOIN locations a ON a.id = c.from_id
     JOIN locations b ON b.id = c.to_id`,
  ).all();
  const upd = d.prepare('UPDATE connections SET minutes = ? WHERE id = ?');
  transaction(() => {
    rows.forEach((r) => {
      const minutes = travelMinutes({
        from: { x: r.ax, y: r.ay, biome: r.ab, danger: r.ad },
        to: { x: r.bx, y: r.by, biome: r.bb, danger: r.bd },
      });
      upd.run(minutes, r.id);
    });
  });
}

export function seedWorld() {
  const db = getDb();
  const existing = db.prepare('SELECT COUNT(*) AS n FROM continents').get().n;
  if (existing > 0) {
    backfillMap();
    backfillTravel();
    return { skipped: true };
  }

  transaction((d) => {
    const insContinent = d.prepare('INSERT INTO continents (name, description, sort_order) VALUES (?, ?, ?)');
    const insRegion = d.prepare('INSERT INTO regions (continent_id, name, description, sort_order) VALUES (?, ?, ?, ?)');
    const insLocation = d.prepare('INSERT INTO locations (region_id, name, description, danger, is_safe, sort_order, map_x, map_y, scene, biome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const insConn = d.prepare('INSERT OR IGNORE INTO connections (from_id, to_id, label) VALUES (?, ?, ?)');
    const insMonster = d.prepare(
      `INSERT INTO monsters (name, description, level, max_hp, attack, defense, accuracy, evasion, speed, mana, stamina, class_key, xp_reward, gold_reward)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insSpawn = d.prepare('INSERT OR IGNORE INTO location_monsters (location_id, monster_id, weight) VALUES (?, ?, ?)');

    const locIds = new Map();
    WORLD.forEach((c, ci) => {
      const cid = insContinent.run(c.name, c.description, ci).lastInsertRowid;
      c.regions.forEach((r, ri) => {
        const rid = insRegion.run(cid, r.name, r.description, ri).lastInsertRowid;
        r.locations.forEach((l, li) => {
          const lid = insLocation.run(rid, l.name, l.description, l.danger, l.safe ? 1 : 0, li, l.x ?? null, l.y ?? null, l.scene ?? null, l.biome ?? null).lastInsertRowid;
          locIds.set(l.name, lid);
        });
      });
    });

    WORLD.flatMap((c) => c.regions).flatMap((r) => r.locations).forEach((l) => {
      (l.connects || []).forEach((target) => {
        const from = locIds.get(l.name); const to = locIds.get(target);
        if (from && to) { insConn.run(from, to, `Дорога к ${target}`); insConn.run(to, from, `Дорога к ${l.name}`); }
      });
    });

    const monIds = new Map();
    MONSTERS.forEach((m) => {
      const mid = insMonster.run(m.name, m.description, m.level, m.max_hp, m.attack, m.defense, m.accuracy, m.evasion, m.speed, m.mana, m.stamina, m.class_key, m.xp_reward, m.gold_reward).lastInsertRowid;
      monIds.set(m.name, mid);
    });

    Object.entries(SPAWNS).forEach(([locName, names]) => {
      const lid = locIds.get(locName);
      if (!lid) return;
      names.forEach((n, i) => { const mid = monIds.get(n); if (mid) insSpawn.run(lid, mid, Math.max(1, 5 - i)); });
    });
  });
  backfillTravel();
  return { continents: WORLD.length, monsters: MONSTERS.length };
}
