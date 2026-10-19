// Generates a whole race or class when the player asks the Interviewer to do it
// for them ("создай сам", "придумай за меня").
//
// The built-in engine runs with no model and no key, so the sheets are composed
// from themed building blocks rather than written by an LLM: each theme carries
// its own abilities *and* the weaknesses that balance them, so any combination
// stays inside the balance rules by construction. A seed taken from the dialogue
// rotates the theme, so asking twice gives a different result.

// The bundle flattens every module into one scope, so this helper is named to stay
// unique against the same helper in ai-engine.js.
const genPick = (lang, ru, en) => (lang === 'en' ? en : ru);

// --- races -----------------------------------------------------------------
// Each theme is self-consistent: the habitat explains the abilities, the
// abilities explain the weaknesses, and the magic line never crosses the
// "no more than two schools" rule.
const RACE_THEMES = [
  {
    names: ['Пепельники', 'Углежоги'], selves: ['Тлеющие', 'Пепельные'],
    look: 'Пепельно-серая кожа в трещинах, под которой тлеет багровый жар; глаза — угли без белков; сухощавы, среднего роста, всегда пахнут дымом.',
    habitat: 'выжженные пустоши и пепельные степи там, где прошла Великая Битва',
    activity: 'собирают пепел павших, куют обсидиан, служат проводниками через выжженные земли',
    combat: 'бьются на средней дистанции: швыряют раскалённые обломки и поджигают землю под ногами врага',
    powers: [
      ['Жар ядра', 'касание обжигает: 15 урона огнём и подпалина на 2 хода'],
      ['Тлеющий шаг', 'мгновенно переносятся к любому открытому огню в пределах видимости']
    ],
    weak: [
      'Вода и холод: во влажном месте жар гаснет — способности стоят вдвое дороже, движения вялы',
      'Хрупкий пепел: дробящее оружие наносит на треть больше урона'
    ],
    society: 'воинские общины вокруг общего кострища; правят не старейшие, а те, кто дольше всех продержался в огне; чужака пускают к костру, но не к кузне',
    magic: ['Огонь и Руны', 'Лёд и Природа'],
    relations: 'к людям — настороженно (те жгли их земли); к эльфам — презрительно (слишком мягкие); к драконорождённым — как к родичам по жару; к дворфам — с уважением за кузни; к оркам — как к достойным противникам; к павшим — с жалостью, пускают к костру',
    fear: 'боятся утонуть и боятся погаснуть'
  },
  {
    names: ['Инеистые', 'Морозники'], selves: ['Белые', 'Стужёные'],
    look: 'Кожа цвета старого снега, волосы — белые пряди, глаза бледно-голубые без зрачка; дышат морозным паром даже в жару, пальцы покрыты инеем.',
    habitat: 'высокогорные плато и ледники на границе Кхарада',
    activity: 'хранят тропы через перевалы, охотятся на ледяных тварей, вырезают руны на льду',
    combat: 'держат дистанцию, ставят ледяные стены и замораживают оружие врага',
    powers: [
      ['Дыхание стужи', 'конус холода: 18 урона и замедление на 2 хода'],
      ['Ледяная броня', 'наращивает лёд: +5 к защите, но −2 к скорости, пока держится']
    ],
    weak: [
      'Огонь: жар плавит их броню и наносит двойной урон',
      'Хрупкость: от резкого удара лёд на теле трескается, и они теряют 5 ХП за ход, пока не отогреются'
    ],
    society: 'кланы, что держатся вместе только зимой; летом расходятся по одиночке; решения принимает тот, кто пережил больше зим',
    magic: ['Лёд и Ветер', 'Огонь и Кровь'],
    relations: 'к людям — равнодушно; к эльфам — с недоверием (лес для них мёртв); к драконорождённым — враждебно (жар убивает); к дворфам — по-деловому, меняют лёд на металл; к оркам — с уважением за выносливость; к павшим — избегают, считая их «оттаявшими мертвецами»',
    fear: 'боятся огня и тесноты'
  },
  {
    names: ['Костяные', 'Гробовники'], selves: ['Молчащие', 'Сухие'],
    look: 'Сухая, натянутая на кости кожа серо-жёлтого оттенка, глубоко посаженные глаза с мутной радужкой; говорят шёпотом, почти не открывая рта.',
    habitat: 'катакомбы и старые склепы Элдарии, заброшенные шахты Подземелья',
    activity: 'оберегают могилы, выкупают и перезахоранивают кости, ведут счёт умершим',
    combat: 'дерутся медленно и упорно, не чувствуют боли и не отступают',
    powers: [
      ['Шёпот мёртвых', 'задают вопрос останкам: те отвечают тем, что знали при жизни'],
      ['Немота смерти', 'взглядом лишают цель голоса на 2 хода — та не может колдовать и звать на помощь']
    ],
    weak: [
      'Голоса: они слышат мёртвых постоянно; в тишине легко теряют рассудок и на день теряют способности',
      'Свет и серебро: освящённое оружие жжёт их как живое, нанося двойной урон'
    ],
    society: 'тихие дома во главе с теми, кто помнит больше всех имён; никого не хоронят без свидетеля',
    magic: ['Некромантия и Тьма', 'Свет и Природа'],
    relations: 'к людям — как к шумным детям; к эльфам — с уважением (те не боятся смерти); к драконорождённым — холодно; к дворфам — по-деловому; к оркам — настороженно; к павшим — как к своим, первыми дают им кров',
    fear: 'боятся забвения'
  },
  {
    names: ['Соляные', 'Приливные'], selves: ['Солёные', 'Морские'],
    look: 'Кожа покрыта соляной коркой, волосы — жёсткие, как водоросли; глаза цвета мёртвой воды, между пальцами перепонки, дышат и жабрами, и лёгкими.',
    habitat: 'солёные болота и берега неспокойных морей Вел\'Моры',
    activity: 'водят корабли между рифами, добывают соль, вытаскивают утопленников',
    combat: 'затягивают врага в воду, бьют острогой и топят',
    powers: [
      ['Соляной плевок', 'осыпает врага солью: 12 урона и −3 к точности на 2 хода'],
      ['Дыхание глубины', 'под водой дышат и видят в темноте, а на суше могут задержать дыхание на час']
    ],
    weak: [
      'Сухость: вдали от воды слабеют — раз в день теряют 10 ХП, если не смочат кожу',
      'Соль как рана: их же соль разъедает открытые раны, поэтому лечение действует вдвое слабее'
    ],
    society: 'береговые артели, где слово капитана выше закона; долг перед артелью важнее жизни',
    magic: ['Ветер и Природа', 'Огонь и Руны'],
    relations: 'к людям — настороженно, но торгуют; к эльфам — с недоверием; к драконорождённым — с опаской; к дворфам — по-деловому; к оркам — нейтрально; к павшим — равнодушно',
    fear: 'боятся пересохнуть'
  },
  {
    names: ['Глубинные', 'Каменники'], selves: ['Каменные', 'Нижние'],
    look: 'Плотная, как базальт, кожа с прожилками руды; глаза светятся тусклым янтарём; роста низкого, широки в плечах, почти не моргают.',
    habitat: 'глубокие пещеры и старые рудники под горами Кхарада',
    activity: 'ведут счёт жилам руды, роют тоннели, чинят обвалы',
    combat: 'держат узкий проход, бьют молотом и обрушивают камень на головы',
    powers: [
      ['Каменная кожа', 'твердеет: получаемый физический урон вдвое меньше на 2 хода'],
      ['Чутьё жилы', 'чувствуют пустоты и металл в камне на десятки шагов']
    ],
    weak: [
      'Тяжесть: медлительны, не плавают и тонут камнем на дно',
      'Долг: без сна в камне слабеют — каждые сутки без отдыха теряют 5 ХП и 5 к точности'
    ],
    society: 'артели во главе со старшим мастером; того, кто соврал о жиле, изгоняют вниз навсегда',
    magic: ['Руны и Природа', 'Ветер и Тьма'],
    relations: 'к людям — по-деловому; к эльфам — с презрением (лес — не камень); к драконорождённым — с уважением за силу; к дворфам — как к соперникам по ремеслу; к оркам — нейтрально; к павшим — не пускают в шахты',
    fear: 'боятся обвала и открытого неба'
  },
  {
    names: ['Грозовые', 'Небесники'], selves: ['Громовые', 'Ветряные'],
    look: 'Кожа с пепельным отливом, волосы стоят дыбом от статики; глаза белые, светящиеся; в гневе вокруг них трещат искры.',
    habitat: 'одинокие плато и обветренные скалы, где чаще бьют молнии',
    activity: 'ловят молнии в копья-громоотводы, предсказывают бури, служат наёмниками-наблюдателями',
    combat: 'бьют молнией с дистанции и уходят в разряд',
    powers: [
      ['Разряд', 'молния: 20 урона и оглушение на 1 ход'],
      ['Грозовой шаг', 'мгновенно переносятся к месту, где только что сверкнула молния']
    ],
    weak: [
      'Земля: заземление вредит — стоя на голой земле, они получают вдвое больше урона от молний и не могут уйти шагом',
      'Разряд в кровь: при перегрузке (0 ресурса) теряют сознание на 2 хода'
    ],
    society: 'вольные ватаги без вождей; слушаются только того, кто громче всех переживёт бурю',
    magic: ['Молния и Ветер', 'Некромантия и Кровь'],
    relations: 'к людям — свысока; к эльфам — нейтрально; к драконорождённым — как к небесным родичам; к дворфам — с насмешкой; к оркам — с уважением; к павшим — равнодушно',
    fear: 'боятся заземления и цепей'
  }
];

// Which race theme fits what the player actually asked for. The player often opens
// with a concept of their own ("полулюди, полунежить", "ледяные, живут в горах"),
// and building a random theme would ignore it. Each theme is scored by the idea's
// words; a tie or a blank idea falls back to the seed, so the same request stays
// stable and a request with no recognizable words still gets a race.
const RACE_THEME_HINTS = [
  [/(пепел|огн|жар|уголь|обсидиан|дым|тле|костр|кузн|лав)/i, 0],
  [/(лёд|лед|мороз|снег|стуж|зим|холод|иней|мёрзл|мерзл)/i, 1],
  [/(кост|скелет|мёртв|мертв|гроб|склеп|могил|нежить|могиль|катакомб|погреб|шов)/i, 2],
  [/(солён|солен|соль|мор|океан|вод|прилив|болот|утопл|гавань|глубин|перепонк)/i, 3],
  [/(камен|скал|глубин|пещер|подзем|руд|базальт|шахт|гранит)/i, 4],
  [/(гроз|молн|неб|ветр|бур|гром|разряд|грозов|электр)/i, 5]
];

function themeIndexForConcept(concept, seed) {
  const text = String(concept || '');
  let best = -1;
  let bestScore = 0;
  RACE_THEME_HINTS.forEach(([re, idx]) => {
    const hits = (text.match(new RegExp(re.source, 'gi')) || []).length;
    if (hits > bestScore) { bestScore = hits; best = idx; }
  });
  return bestScore > 0 ? best : seed % RACE_THEMES.length;
}

// A race request that also carries the race's nature ("полу люди, полу нежить",
// "ледяные, что живут в горах"). The Interviewer builds the race from these words
// instead of ignoring the player's idea and asking for a name. A bare "хочу расу"
// has no nature word, so it still opens the walk. Shared with the engine, which
// needs it to tell a concept request from a plain one.
export const RACE_NATURE = /(?<![а-яё])(полу|половин|гибрид|нежить|нежит|мертв|мёртв|вампир|призрак|скелет|зомби|костян|ледян|огненн|каменн|болотн|морск|водян|грозов|пепельн|тёмн|темн|светл|кров|тень|тенев|звер|птиц|дракон|демон|ангел|эльф|орк|гном|дворф|человек|люд|рыб|насеком|растен|гриб|кристалл|механ|облачн|снежн|песчан|пустынн|лесн|горн|подземн|глубинн|солён|солен|солян|морозн|инеист|пепел|угольн|глинян|бронзов|железн|стальн)/i;

// The theme's own name when the player's idea names the race's nature, so a
// "полунежить" concept comes back as the skeletal race rather than a random one.
// The player's own words are kept in a separate line instead of overwriting the
// template, which keeps the sheet's field order intact. Only the sentence that
// carries the idea is kept, so the pleasantries around it do not ride along.
export function conceptName(concept) {
  const text = String(concept || '').trim();
  if (!text) return '';
  const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  const carries = sentences.filter((s) => RACE_NATURE.test(s));
  const source = (carries.length ? carries : sentences).slice(-1)[0] || '';
  const clean = source
    .replace(/^(что\s*бы\s+это\s+были|чтобы\s+это\s+были|это\s+будут|это\s+были|пусть\s+(это\s+)?будут|были|будут|это\s+будет|это|хочу|хотел[аи]?|давай|можешь|сможешь|нужна|надо|сдела[йть]|созда[йть]|придума[йть])\s+/gi, '')
    .replace(/\s+(расу|раса|рассу|класс|клас)$/i, '')
    .replace(/[?!.]+$/g, '')
    .trim();
  if (!clean) return '';
  return clean.length > 90 ? `${clean.slice(0, 89).trimEnd()}…` : clean;
}

// The sheet the owner receives, in the order of the race template, so it can be
// pasted into the blog as-is. The weaknesses come from the theme itself, which is
// what makes every generated race pass the "minimum two weaknesses" rule. When the
// player brought a concept, the theme is chosen to match it and the idea is quoted
// in the sheet, so the race answers what was asked for instead of a random theme.
function raceDraft(lang, seed, concept = '') {
  const t = RACE_THEMES[themeIndexForConcept(concept, seed)];
  const name = t.names[(seed >>> 5) % t.names.length];
  const self = t.selves[(seed >>> 9) % t.selves.length];
  const [magic, noMagic] = t.magic;
  const idea = conceptName(concept);
  const lines = [
    `Название: ${name}`,
    `Самоназвание: ${self}`,
    `Внешность: ${t.look}`,
    `Где живут: ${t.habitat}`,
    `Чем занимаются: ${t.activity}`,
    `Боевые навыки: ${t.combat}`,
    `Способности: ${t.powers.map(([n, e]) => `${n} — ${e}`).join('; ')}`,
    `Уязвимости: ${t.weak.join('; ')}`,
    `Чего боятся: ${t.fear}`,
    `Общественное устройство: ${t.society}`,
    `Магия: владеют — ${magic}; не владеют — ${noMagic}`,
    `Отношения с другими расами: ${t.relations}`
  ];
  if (idea) lines.splice(1, 0, `Идея игрока: ${idea}`);
  const app = {
    _kind: 'race',
    'Название': name,
    'Самоназвание': self,
    'Внешность': t.look,
    'Где живут': t.habitat,
    'Чем занимаются': t.activity,
    'Боевые навыки': t.combat,
    'Способности': t.powers.map(([n, e]) => `${n} — ${e}`).join('; '),
    'Уязвимости': t.weak.join('; '),
    'Чего боятся': t.fear,
    'Общественное устройство': t.society,
    'Магия': `владеют — ${magic}; не владеют — ${noMagic}`,
    'Отношения с другими расами': t.relations
  };
  if (idea) app['Идея игрока'] = idea;
  return { kind: 'race', name, app, text: lines.join('\n'), concept: idea };
}

// --- classes ---------------------------------------------------------------
// Each theme carries a resource, a start value, a basic attack and a level-1..15
// ability list with a cooldown in turns on every ability, which is the rule the
// owner asked for. The numbers stay inside class_balance_rules: 100–120 HP,
// +10–15 per level, 30–50 resource, +3–5 per level, 15 max basic attack,
// 50 max ability damage at 15, and the two ultimates at 35 / 60.
const CLASS_THEMES = [
  {
    names: ['Пепельный страж', 'Угольный страж'],
    role: 'танк-выжигатель: держит линию и жжёт всё, что подходит близко',
    resource: 'Жар',
    start: '45 жара (+4 за уровень)',
    basic: '3 жара',
    hp: 120, hpGrow: 15,
    abilities: [
      ['Раскалённая кожа', '2 хода', '10 жара', '+5 к защите; каждый, кто бьёт в упор, получает 6 урона огнём'],
      ['Угольный плевок', '3 хода', '12 жара', '18 урона огнём одной цели'],
      ['Огненная борозда', '4 хода', '18 жара', 'полоса огня: 22 урона всем на линии и горение на 2 хода'],
      ['Пепельная завеса', '5 ходов', '20 жара', 'ослепляет врагов на 1 ход и снижает их точность на 3'],
      ['Тлеющее сердце', '6 ходов', '25 жара', 'возвращает 25 ХП, но получает +25% урона холодом до конца боя'],
      ['Взрыв углей', '5 ходов', '30 жара', '32 урона по площади вокруг себя'],
      ['Пепельный панцирь', '6 ходов', '28 жара', 'поглощает 30 урона, пока держится'],
      ['Выжженная земля', '6 ходов', '35 жара', '38 урона по площади и −2 к скорости врагов на 2 хода'],
      ['Обсидиановый клинок', '4 хода', '22 жара', 'базовая атака наносит 20 урона вместо 12 на 3 хода'],
      ['Пепельный вихрь', '5 ходов', '30 жара', '30 урона всем рядом и отбрасывает их на шаг'],
      ['Столб пламени', '7 ходов', '40 жара', '45 урона одной цели, стоящей на месте'],
      ['Жар земли', '8 ходов', '45 жара', '48 урона по площади и −3 к защите врагов на 2 хода']
    ],
    ult1: ['Пепельное небо', '1 раз за сессию', '35 жара', '35 урона всем врагам и −3 к их точности до конца боя'],
    ult2: ['Погребальный костёр', '1 раз за сессию', '50 жара', '60 урона по выбранной области и горение на 2 хода'],
    evolutions: ['Кузнец — кует броню союзникам', 'Пепельный жрец — лечит себя из огня', 'Обугленный — становится неудержимым, но теряет защиту'],
    limits: 'Огонь вредит своим: рядом с союзниками урон по площади режется вдвое',
    weak: 'Холод и вода гасят жар: урон холодом повышен на 25%, а в воде способности стоят вдвое дороже',
    exhaust: 'жар = 0 → не может использовать способности 2 хода и получает 8 урона за ход, пока жар не вернётся'
  },
  {
    names: ['Ткач стужи', 'Ледяной ткач'],
    role: 'контроллер: замедляет и запирает врага, не подпуская к себе',
    resource: 'Мороз',
    start: '50 мороза (+5 за уровень)',
    basic: '4 мороза',
    hp: 100, hpGrow: 10,
    abilities: [
      ['Морозный укол', '2 хода', '10 мороза', '15 урона холодом и −1 к скорости цели'],
      ['Ледяная корка', '3 хода', '15 мороза', '+4 к защите союзника на 2 хода'],
      ['Стынь', '4 хода', '20 мороза', 'замедляет цель на 3 хода: она ходит через раз'],
      ['Осколки льда', '3 хода', '22 мороза', '25 урона по площади и −2 к точности врагов'],
      ['Ледяная стена', '5 ходов', '25 мороза', 'стена на 2 хода: враг не проходит и получает 12 урона при попытке'],
      ['Скованный воздух', '5 ходов', '28 мороза', '30 урона и обездвиживание цели на 1 ход'],
      ['Иней в крови', '6 ходов', '30 мороза', '32 урона и −3 к защите цели на 2 хода'],
      ['Зеркальный лёд', '6 ходов', '30 мороза', 'отражает 50% следующего магического урона по себе'],
      ['Пурга', '7 ходов', '38 мороза', '40 урона по области и −3 к точности врагов на 2 хода'],
      ['Ледяной саркофаг', '7 ходов', '40 мороза', 'запирает цель на 2 хода; она не может действовать'],
      ['Абсолютный холод', '8 ходов', '45 мороза', '48 урона одной цели и −2 к её скорости до конца боя'],
      ['Сердце зимы', '8 ходов', '50 мороза', '50 урона по площади и −3 к скорости всех врагов']
    ],
    ult1: ['Ледяное безмолвие', '1 раз за сессию', '35 мороза', '35 урона всем врагам и оглушение на 1 ход'],
    ult2: ['Вечная стужа', '1 раз за сессию', '50 мороза', '60 урона по выбранной области и −3 к скорости врагов до конца боя'],
    evolutions: ['Ледяной щит — держит удар вместо союзников', 'Стужёный убийца — бьёт осколками насквозь', 'Хранитель зимы — лечит союзников льдом'],
    limits: 'Не может колдовать, если рядом открытый огонь: жар гасит мороз, и способности недоступны 1 ход',
    weak: 'Огонь плавит их: урон огнём повышен на 30%',
    exhaust: 'мороз = 0 → способности недоступны 2 хода и защита падает вдвое, пока мороз не вернётся'
  },
  {
    names: ['Костепевец', 'Гробовый певец'],
    role: 'призыватель: поднимает кости и бьёт ими по чужой воле',
    resource: 'Кости',
    start: '40 костей (+4 за уровень)',
    basic: '3 кости',
    hp: 105, hpGrow: 11,
    abilities: [
      ['Костяной шип', '2 хода', '8 костей', '14 урона одной цели'],
      ['Поднять слугу', '4 хода', '15 костей', 'поднимает костяного слугу: 20 ХП, 8 урона, живёт 3 хода'],
      ['Прах в глаза', '3 хода', '12 костей', '−3 к точности цели на 2 хода'],
      ['Костяная стена', '5 ходов', '20 костей', 'щит на 25 урона для союзника'],
      ['Взрыв костей', '5 ходов', '22 костей', '25 урона по площади вокруг слуги'],
      ['Хоровод мёртвых', '6 ходов', '28 костей', 'поднимает второго слугу и лечит первого на 15 ХП'],
      ['Песнь праха', '6 ходов', '30 костей', '30 урона всем врагам рядом и −2 к их защите'],
      ['Костяной панцирь', '6 ходов', '28 костей', '+6 к защите себе на 2 хода'],
      ['Проклятие кости', '7 ходов', '35 костей', '35 урона цели; если она умирает, встаёт на 2 хода как слуга'],
      ['Погребальная песнь', '7 ходов', '38 костей', '38 урона по области и страх: враги не подходят 1 ход'],
      ['Костяной вихрь', '8 ходов', '45 костей', '45 урона одной цели и −2 к её скорости до конца боя'],
      ['Царь костей', '8 ходов', '50 костей', '48 урона по площади и все слуги бьют вне очереди']
    ],
    ult1: ['Зов гробницы', '1 раз за сессию', '35 костей', '35 урона всем врагам и поднимает слугу за каждого павшего'],
    ult2: ['Костяной легион', '1 раз за сессию', '50 костей', '60 урона по выбранной области и три слуги на 3 хода'],
    evolutions: ['Владыка мёртвых — ведёт больше слуг', 'Костяной тиран — сам становится слугой-гигантом', 'Певец праха — лечит союзников чужой смертью'],
    limits: 'Слуги рассыпаются, если хозяин оглушён: приказ нельзя отдать, пока не придёт в себя',
    weak: 'Освящённое оружие и свет жгут их слуг вдвое сильнее, а сам костепевец получает +20% урона от света',
    exhaust: 'кости = 0 → не может поднимать слуг 3 хода; уже поднятые слуги рассыпаются через ход'
  },
  {
    names: ['Приливный охотник', 'Соляной охотник'],
    role: 'ловкий боец ближнего боя: топит и режет острогой',
    resource: 'Соль',
    start: '45 соли (+4 за уровень)',
    basic: '3 соли',
    hp: 110, hpGrow: 12,
    abilities: [
      ['Острога', '2 хода', '8 соли', '16 урона одной цели'],
      ['Соляной след', '3 хода', '12 соли', '+3 к скорости себе на 2 хода'],
      ['Тяга глубины', '4 хода', '18 соли', 'тянет цель к себе на шаг и наносит 20 урона'],
      ['Соляная завеса', '4 хода', '20 соли', '−3 к точности врагов рядом на 2 хода'],
      ['Гарпун', '5 ходов', '22 соли', '25 урона на дистанции и приковывает цель на 1 ход'],
      ['Дыхание соли', '5 ходов', '25 соли', '28 урона по площади и разъедает броню: −3 к защите на 2 хода'],
      ['Прилив', '6 ходов', '30 соли', '32 урона всем врагам рядом и отбрасывает их'],
      ['Соль в раны', '6 ходов', '30 соли', '30 урона цели; её лечение вдвое слабее 2 хода'],
      ['Мёртвая вода', '7 ходов', '35 соли', '36 урона по области и −2 к скорости врагов'],
      ['Утопление', '7 ходов', '38 соли', '40 урона одной цели, если она уже замедлена'],
      ['Соляной вихрь', '8 ходов', '45 соли', '46 урона по площади и −3 к защите врагов'],
      ['Хозяин прилива', '8 ходов', '50 соли', '50 урона по области и все враги замедлены до конца боя']
    ],
    ult1: ['Девятый вал', '1 раз за сессию', '35 соли', '35 урона всем врагам и −3 к их точности до конца боя'],
    ult2: ['Холодная пучина', '1 раз за сессию', '50 соли', '60 урона по выбранной области и обездвиживание на 1 ход'],
    evolutions: ['Глубинный ужас — тащит врага на дно', 'Соляной клинок — режет быстрее всех', 'Хранитель берега — закрывает союзников собой'],
    limits: 'Вдали от воды слабеет: вне боя у моря или болота теряет 5 соли в час и не восстанавливает её до отдыха',
    weak: 'Сухость: на суше получаемый урон повышен на 15%',
    exhaust: 'соль = 0 → 2 хода не может использовать способности и теряет 3 ХП за ход, пока соль не вернётся'
  },
  {
    names: ['Рудный кователь', 'Каменный кователь'],
    role: 'стойкий мастер: бьёт молотом и держит проход',
    resource: 'Руда',
    start: '50 руды (+5 за уровень)',
    basic: '4 руды',
    hp: 120, hpGrow: 15,
    abilities: [
      ['Удар молота', '2 хода', '10 руды', '18 урона одной цели'],
      ['Каменная хватка', '3 хода', '15 руды', '+5 к защите себе на 2 хода'],
      ['Обвал', '5 ходов', '22 руды', '25 урона по площади и −2 к скорости врагов'],
      ['Рудная метка', '3 хода', '15 руды', 'цель получает +5 урона от всех атак на 2 хода'],
      ['Каменный щит', '5 ходов', '22 руды', 'щит на 30 урона союзнику'],
      ['Дрожь земли', '5 ходов', '28 руды', '30 урона всем врагам рядом и сбивает их с ног на 1 ход'],
      ['Рудный панцирь', '6 ходов', '30 руды', '+6 к защите и −2 к скорости себе на 2 хода'],
      ['Молот в наковальню', '6 ходов', '32 руды', '34 урона одной цели и −3 к её защите на 2 хода'],
      ['Стальная воля', '6 ходов', '30 руды', 'снимает страх и оглушение с себя и союзника рядом'],
      ['Обвал свода', '7 ходов', '40 руды', '40 урона по области и враги не могут войти в зону 1 ход'],
      ['Кузнечный жар', '8 ходов', '45 руды', '45 урона одной цели и −2 к её скорости до конца боя'],
      ['Недра', '8 ходов', '50 руды', '48 урона по площади и −3 к защите всех врагов']
    ],
    ult1: ['Сердце горы', '1 раз за сессию', '35 руды', '35 урона всем врагам и −3 к их точности до конца боя'],
    ult2: ['Горный слом', '1 раз за сессию', '50 руды', '60 урона по выбранной области и обездвиживание на 1 ход'],
    evolutions: ['Мастер брони — кует защиту союзникам', 'Разрушитель — бьёт так, что ломает оружие', 'Хранитель недр — держит проход один против многих'],
    limits: 'Тяжёл и медлителен: не может носить лёгкое оружие, а уклонение всегда на 2 ниже обычного',
    weak: 'Вода и лёд: урон холодом повышен на 20%, а в воде он не может двигаться',
    exhaust: 'руда = 0 → 2 хода не может использовать способности и получает 10 урона за ход, пока руда не вернётся'
  },
  {
    names: ['Громовой заклинатель', 'Бурный заклинатель'],
    role: 'дальний маг: бьёт молнией и разгоняет бой',
    resource: 'Разряд',
    start: '40 разряда (+4 за уровень)',
    basic: '3 разряда',
    hp: 100, hpGrow: 10,
    abilities: [
      ['Искра', '2 хода', '8 разряда', '16 урона одной цели'],
      ['Разгон', '3 хода', '12 разряда', '+3 к скорости союзника на 2 хода'],
      ['Цепь', '4 хода', '20 разряда', '22 урона и перескакивает на второго врага рядом'],
      ['Громовой щит', '5 ходов', '20 разряда', 'отражает 10 урона тому, кто бьёт в упор, 2 хода'],
      ['Шаровая молния', '5 ходов', '25 разряда', '28 урона по площади'],
      ['Оглушение', '6 ходов', '28 разряда', '30 урона цели и оглушение на 1 ход'],
      ['Статика', '5 ходов', '25 разряда', '−3 к точности врагов рядом на 2 хода'],
      ['Грозовой шаг', '6 ходов', '30 разряда', 'переносится к месту вспышки и бьёт на 25 урона вокруг'],
      ['Разряд в кровь', '7 ходов', '35 разряда', '35 урона одной цели и −3 к её защите на 2 хода'],
      ['Буря', '7 ходов', '38 разряда', '40 урона по области и −2 к скорости врагов'],
      ['Небесный гнев', '8 ходов', '45 разряда', '46 урона одной цели, оглушая её на 1 ход'],
      ['Хозяин грозы', '8 ходов', '50 разряда', '50 урона по площади и −3 к точности врагов до конца боя']
    ],
    ult1: ['Гроза', '1 раз за сессию', '35 разряда', '35 урона всем врагам и оглушение на 1 ход'],
    ult2: ['Небесный разлом', '1 раз за сессию', '50 разряда', '60 урона по выбранной области и −3 к защите врагов до конца боя'],
    evolutions: ['Громовой жрец — лечит союзников разрядом', 'Проводник бури — бьёт по всем сразу', 'Небесный страж — закрывает союзника грозовым щитом'],
    limits: 'Заземление опасно: рядом с металлом или водой он получает +20% урона от электричества',
    weak: 'Хрупок: получает на 15% больше физического урона от ближнего боя',
    exhaust: 'разряд = 0 → базовая атака наносит вдвое меньше, а способности недоступны 2 хода'
  }
];

// Cooldowns stay short on purpose: the owner asked for them not to be so long that
// a class is awkward to play, so a base ability is capped at 4 turns and a
// specialization ability at 5. A stored cooldown that is already short is kept as
// is; only the long ones are pulled down.
const ABILITY_CD_CAP = 4;
const SPEC_CD_CAP = 5;

function turnsWord(n) {
  const m = n % 100;
  if (m >= 11 && m <= 14) return 'ходов';
  const d = n % 10;
  if (d === 1) return 'ход';
  if (d >= 2 && d <= 4) return 'хода';
  return 'ходов';
}

const cdText = (n) => `${n} ${turnsWord(n)}`;

function shortCd(cd, cap = ABILITY_CD_CAP) {
  const m = String(cd).match(/(\d+)/);
  if (!m) return cd;
  return cdText(Math.min(cap, Number(m[1])));
}

// Which base role a theme leans to, read from its own wording so the second ability
// on each level matches the class instead of an index.
function themeRole(t) {
  const s = `${t.role} ${t.resource}`.toLowerCase();
  if (/призыва|поднима|слуг|кост|мёртв|мертв/.test(s)) return 'summon';
  if (/контрол|замедля|запира/.test(s)) return 'control';
  if (/дальн|маг|молни|заклина/.test(s)) return 'caster';
  if (/танк|выжиг|стойк|держит|проход|мастер/.test(s)) return 'guard';
  return 'blade';
}

// The three levels past the theme's twelve signature abilities. They carry the class
// to level 15 with a heavy hit near the 50-damage ceiling.
function heavyAbility(t, index) {
  const dmg = 42 + index * 3;
  const names = ['Погибель', 'Расплата', 'Последний удар'];
  return [names[index % names.length], '4 хода', `${45 + index * 3} ${t.resource.toLowerCase()}`,
    `${dmg} урона по площади и −3 к защите врагов на 2 хода`];
}

// The second ability on every level 1–15, so no level offers fewer than the two the
// balance rules ask for ("2–3 способности на каждый уровень"). It is a role-flavoured
// utility: a guard's shield, a blade's gap-closer, a summoner's servant, a caster's
// burst, a controller's hex.
function utilityAbility(t, level) {
  const step = level - 1;
  const cost = `${Math.min(50, 6 + Math.round(step * 1.2))} ${t.resource.toLowerCase()}`;
  const cd = cdText(Math.min(ABILITY_CD_CAP, 1 + Math.round(step / 5)));
  const variants = {
    guard: [
      `+${3 + Math.round(step / 3)} к защите себе на 2 хода`,
      `щит на ${15 + step * 2} урона союзнику`,
      'снимает оглушение и страх с союзника рядом'
    ],
    blade: [
      `+${3 + Math.round(step / 4)} к скорости себе на 2 хода`,
      `рывок к цели и ${12 + step} урона`,
      `${12 + step} урона и −2 к защите цели на 2 хода`
    ],
    control: [
      `−${2 + Math.round(step / 6)} к точности врагов рядом на 2 хода`,
      `замедляет цель на ${1 + Math.round(step / 8)} ход`,
      'сковывает цель: она не может двигаться 1 ход'
    ],
    summon: [
      `поднимает слугу: ${15 + step} ХП, ${6 + Math.round(step / 2)} урона`,
      `лечит слугу на ${10 + step} ХП`,
      'приказывает слугам бить вне очереди 1 ход'
    ],
    caster: [
      `${12 + step} урона одной цели на дистанции`,
      `${10 + step} урона по области`,
      '−2 к точности врагов рядом на 2 хода'
    ]
  };
  const nouns = { guard: 'Стойка', blade: 'Выпад', control: 'Оковы', summon: 'Приказ', caster: 'Печать' };
  const role = themeRole(t);
  const effect = variants[role][(level - 1) % variants[role].length];
  return [`${nouns[role]} ${level}`, cd, cost, effect];
}

function abilityLine(level, name, cd, cost, effect) {
  return `Ур. ${level}: ${name} — ${effect}. Стоимость: ${cost}. Перезарядка: ${cd}.`;
}

// Two abilities on every level 1–15: the theme's signature power, then a role
// utility. The list is written as "Ур. N: Название — эффект. Стоимость: X.
// Перезарядка: Y.", one ability per line.
function classAbilityLines(t) {
  const out = [];
  for (let level = 1; level <= 15; level++) {
    const i = level - 1;
    const primary = level <= t.abilities.length
      ? t.abilities[i]
      : heavyAbility(t, i - t.abilities.length);
    out.push(abilityLine(level, primary[0], shortCd(primary[1]), primary[2], primary[3]));
    const util = utilityAbility(t, level);
    out.push(abilityLine(level, util[0], util[1], util[2], util[3]));
  }
  return out;
}

// The levels between the milestones. At level 16 a class picks one of three
// specializations, and every level below grants exactly one ability of that
// specialization. The list is fixed by the owner: 16-19, 21-29, 31-39, 41-49.
const SPECIALIZATION_LEVELS = [16, 17, 18, 19, ...Array.from({ length: 9 }, (_, i) => 21 + i),
  ...Array.from({ length: 9 }, (_, i) => 31 + i), ...Array.from({ length: 9 }, (_, i) => 41 + i)];

// Which of the three directions a specialization leans to, read from its own
// wording so the generated abilities match the name rather than an index.
function specRole(focus) {
  const f = String(focus || '').toLowerCase();
  if (/(леч|исцел|поддерж|союзник|щит|защищ|броня|брон)/.test(f)) return 'guard';
  if (/(бьёт|бьет|урон|неудержим|убийц|разруш|гнев|клинок|режет)/.test(f)) return 'blade';
  return 'craft';
}

// One ability per level. The numbers grow with the level and stay inside the class
// balance rules: the last specialization ability is about as strong as the level-15
// ultimate, and nothing reaches the ultimate-2 ceiling of 60.
function specAbility(specName, role, level, index) {
  const step = level - 16;
  const cost = Math.min(50, 15 + Math.round(step * 1.15));
  const cd = Math.min(8, 3 + Math.round(step / 5));
  if (role === 'guard') {
    const shield = 25 + step;
    const heal = 20 + step;
    const variants = [
      `щит на ${shield} урона союзнику`,
      `восстанавливает ${heal} ХП союзнику и себе`,
      `снимает оглушение и страх с союзника`,
      `+${5 + Math.round(step / 3)} к защите всем рядом на 2 хода`
    ];
    return { name: `${specName}: опора ${index + 1}`, effect: variants[index % variants.length] };
  }
  if (role === 'blade') {
    const dmg = Math.min(55, 22 + step);
    const variants = [
      `${dmg} урона одной цели`,
      `${dmg} урона по области и −${2 + Math.round(step / 10)} к защите врагов`,
      `${dmg} урона цели; при её смерти способность готова снова`,
      `${dmg} урона и −${2 + Math.round(step / 12)} к скорости цели до конца боя`
    ];
    return { name: `${specName}: натиск ${index + 1}`, effect: variants[index % variants.length] };
  }
  const dmg = Math.min(48, 20 + step);
  const variants = [
    `${dmg} урона и −2 к точности врагов на 2 хода`,
    `${dmg} урона по области и замедление врагов`,
    `щит на ${18 + step} урона союзнику и ${Math.round(dmg / 2)} урона рядом`,
    `отражает ${20 + step} урона тому, кто бьёт в упор, 2 хода`
  ];
  return { name: `${specName}: приём ${index + 1}`, effect: variants[index % variants.length] };
}

// The three specializations a class offers at level 16, each with one ability on
// every level between the milestones.
function specializationLines(t) {
  const specs = t.evolutions.map((evo) => {
    const [name, ...rest] = String(evo).split('—');
    return { name: name.trim(), focus: rest.join('—').trim() };
  });
  const out = [];
  for (const spec of specs) {
    const role = specRole(spec.focus);
    out.push(`Специализация «${spec.name}» — ${spec.focus}`);
    SPECIALIZATION_LEVELS.forEach((level, i) => {
      const a = specAbility(spec.name, role, level, i);
      const cost = Math.min(50, 15 + Math.round((level - 16) * 1.15));
      const cd = Math.min(SPEC_CD_CAP, 2 + Math.round((level - 16) / 12));
      out.push(`  Ур. ${level}: ${a.name} — ${a.effect}. Стоимость: ${cost}. Перезарядка: ${cd}.`);
    });
  }
  return out;
}

function classDraft(lang, seed) {
  const t = CLASS_THEMES[seed % CLASS_THEMES.length];
  const name = t.names[(seed >>> 5) % t.names.length];
  const abilities = classAbilityLines(t).join('\n');
  const [u1n, u1cd, u1cost, u1e] = t.ult1;
  const [u2n, u2cd, u2cost, u2e] = t.ult2;
  const specs = specializationLines(t).join('\n');
  const specIntro = `Специализации (выбор на 16 уровне): 3 на класс. На каждом промежуточном уровне `
    + `(16–19, 21–29, 31–39, 41–49) — ровно одна способность специализации.`;
  const lines = [
    `Название класса: ${name}`,
    `Роль: ${t.role}`,
    `Ресурс: ${t.resource}`,
    `ХП: ${t.hp} (+${t.hpGrow} за уровень)`,
    `Базовая атака: ${t.basic}`,
    'Способности:',
    abilities,
    `Ультимейт (10 уровень): ${u1n} — ${u1e}. Стоимость: ${u1cost}. Перезарядка: ${u1cd}.`,
    `Ультимейт 2 (15 уровень): ${u2n} — ${u2e}. Стоимость: ${u2cost}. Перезарядка: ${u2cd}.`,
    specIntro,
    specs,
    `Ограничения: ${t.limits}`,
    `Слабости: ${t.weak}`,
    `Истощение ресурса: ${t.exhaust}`
  ];
  const abilityText = [
    ...classAbilityLines(t),
    `Ультимейт (10 уровень): ${u1n} — ${u1e}. Стоимость: ${u1cost}. Перезарядка: ${u1cd}.`,
    `Ультимейт 2 (15 уровень): ${u2n} — ${u2e}. Стоимость: ${u2cost}. Перезарядка: ${u2cd}.`
  ].join('\n');
  return {
    kind: 'class',
    name,
    app: {
      _kind: 'class',
      'Название класса': name,
      'Роль': t.role,
      'Ресурс': t.resource,
      'ХП': `${t.hp} (+${t.hpGrow} за уровень)`,
      'Базовая атака': t.basic,
      'Способности': abilityText,
      'Ультимейт': `${u1n} — ${u1e}. Стоимость: ${u1cost}. Перезарядка: ${u1cd}.`,
      'Ультимейт 2': `${u2n} — ${u2e}. Стоимость: ${u2cost}. Перезарядка: ${u2cd}.`,
      'Специализации и вехи': `${specIntro}\n${specs}`,
      'Ограничения и слабости': `${t.limits}; ${t.weak}`,
      'Истощение ресурса': t.exhaust
    },
    text: lines.join('\n')
  };
}

export function generateRace(lang, seed, concept = '') { return raceDraft(lang, seed, concept); }
export function generateClass(lang, seed) { return classDraft(lang, seed); }

// A class built for an existing, ready race. The player hands over a race they
// already made (or a base race) and asks for a class to match it, so the kit keeps
// the standard balance but is tied to that race by name and a compatibility line.
export function generateClassForRace(lang, seed, raceName) {
  const draft = classDraft(lang, seed);
  const race = String(raceName || '').trim();
  if (!race) return draft;
  draft.app['Под расу'] = race;
  draft.app['Совместимость с расой'] = `Класс создан под готовую расу «${race}»: его ресурс и способности опираются на её природу, а магия класса не спорит с её школами.`;
  draft.text = `Класс под готовую расу «${race}»\n${draft.text}`;
  draft.forRace = race;
  return draft;
}

// A stable seed from the dialogue, so the same request twice in a row gives the
// same sheet (the player sees one answer, not a slot machine), while a different
// request gives a different theme.
export function seedFrom(history) {
  const text = (Array.isArray(history) ? history : [])
    .filter((m) => m && m.role !== 'assistant')
    .map((m) => String(m.content || ''))
    .join(' ');
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// The reply the player sees: a short lead-in, the whole sheet, and the offer to
// review it. The sheet is complete by construction, so the check can pass at once.
export function renderGenerated(draft, lang) {
  const byIdea = draft.kind === 'race' && draft.concept;
  const head = draft.finished
    ? genPick(lang, 'Готово. Дописал всё, что оставалось, — твои ответы сохранил:', 'Done. I filled in what was left — I kept your answers:')
    : draft.kind === 'race'
    ? (byIdea
        ? genPick(lang, 'Готово. Собрал расу по твоей идее — с её природой, способностями и слабостями:', 'Done. I built the race from your idea — its nature, powers and weaknesses:')
        : genPick(lang, 'Готово. Придумал тебе расу целиком — по правилам баланса, со способностями и слабостями:', 'Done. I made you a whole race — balanced, with its own powers and weaknesses:'))
    : genPick(lang, 'Готово. Придумал тебе класс целиком — по правилам баланса, с перезарядкой в ходах:', 'Done. I made you a whole class — balanced, with cooldowns in turns:');
  const tail = genPick(lang,
    'Скажи «проверь» — проверю и отправлю владельцу. Или скажи, что поменять: имя, способности, слабости.',
    'Say "check" and I will review it and send it to the owner. Or tell me what to change: name, powers, weaknesses.');
  return [head, '', draft.text, '', tail].join('\n');
}
