# Grimhollow

A dark-fantasy, classic D&D-flavoured browser RPG. Node/Express + SQLite API
with a React (Vite) client.

## Layout

- `server/` — Express API, game engine, SQLite storage.
  - `src/game/` — pure rules: `classes.js`, `rules.js`, `combat.js`, `travel.js`.
  - `src/db/` — `schema.sql`, connection (`index.js`), world seed (`seed.js`).
  - `src/services/` — persistence + orchestration (`characters`, `world`, `battles`, `travel`).
  - `src/routes/` — HTTP layer.
  - `test/` — `node:test` suites.
- `client/` — React + Vite SPA (`src/pages`, `src/api.js`, `src/icons.jsx`).
  - `public/art/` — CC BY 3.0 icons from game-icons.net, plus one CC0 parchment
    texture for the world map (see `CREDITS.txt`).

## Commands

```bash
npm install                 # installs server + client workspaces
npm run dev                 # server (3001) + vite (5173) together
npm test                    # server test suite (node --test)
npm run build               # build the client into client/dist
npm start                   # run the API, serving client/dist if built
```

## Game design rules (locked)

- Combat is **diceless**: an ability shows an honest hit % (accuracy vs evasion)
  and a damage estimate. No dice rolls are shown to the player.
- Resources are **mana** and **stamina**; both regenerate a little on the
  owner's turn (`MANA_REGEN` / `STAMINA_REGEN` in `game/combat.js`).
- **Speed** decides turn order; there are no extra turns.
- **Defeat is survivable**: the hero keeps 1 HP and loses 25% of their gold
  (`DEFEAT_GOLD_PENALTY` in `services/battles.js`).
- Every class has **5 levels**; each level unlocks **2 abilities** and raises
  HP/mana (plus per-class growth in `game/classes.js`). There are **12 classes**
  (the D&D set).
- XP comes from quests (future), battles, and exploration (future).

## Content language

- All player-visible text is **Russian** (class/monster/location names, ability
  names and descriptions, combat log, UI labels, error messages).
- Stable keys stay **Latin**: class `key` (e.g. `fighter`), ability `id`
  (e.g. `fire_bolt`), stat keys, route paths. These are the identity used by the
  DB, the API, and the client, so never translate them.

## Ability icons

- Icons resolve by `ability.id` via `ABILITY_ICONS` in `client/src/icons.jsx`.
- Each entry maps an id to `client/public/art/abilities/<file>.svg`; a missing
  entry just renders no icon.
- Icons are CC BY 3.0 from game-icons.net (see `client/public/art/CREDITS.txt`
  for the per-file source manifest).

## Party (отряд)

- A party is a **leader** (a normal character) plus **companions** stored in
  `party_members`; each companion is a full sheet of its class/level.
- **14 recruitment sources** live in `game/companions.js` (`RECRUIT_SOURCES`):
  tavern, road, rescue, quest, arena, mercy, ransom, necromancy, guild, beast,
  sermon, deed, favor, orphan. Methods: free | gold | trial | quest | tame |
  raise | persuade | favor.
- `COMPANIONS` holds ready-made people with a history, two pluses, two minuses,
  a starting opinion, a portrait slug and the sources they can appear from.
  Traits live in `TRAITS` (each with `effects` and `likes`/`dislikes`).
- **Relationships** are directed and clamped 0..100: each member feels something
  toward the leader (`to_member_id IS NULL`) and toward every other member.
  `LEAVE_THRESHOLD = 25` — below it with *anyone*, the companion leaves
  (`sweepDepartures`). A fresh bond is seeded 30..90 so nobody leaves on day one.
- Recruitment may be **refused**; `acceptanceChance` is an honest 5..95% shown to
  the player. Deterministic pieces (prices, seeded opinions/bonds) keep it fair;
  `rng` is injectable for tests.
- Endpoints live under `/api/party` (see `routes/party.js`); the UI is
  `pages/Party.jsx` (cards + relation bars) and `pages/Recruit.jsx` (source chips
  + candidates).
- Companion portraits are game-icons faces under `client/public/art/portraits/`
  (map `PORTRAITS` in `game/companions.js`, credited in CREDITS.txt).

### Still to come (approved waves, not yet built)

- 3C battle as a party (control every member; permadeath).
- 3D party upgrade tree paid with a separate **Очки отряда** resource
  (`party_upgrades` table already exists).
- 3E living AI dialogue with the party — self-contained, no external key,
  never breaks the game.
- 3F resurrection rituals (animal sacrifice, no currency).

## Conventions

- ES modules everywhere. Server code has no build step.
- Keep game math in `src/game/*` pure and unit-tested; keep I/O in services/routes.
- The DB auto-seeds on startup (`seedWorld()` in `src/index.js`). The sqlite file
  lives in `server/src/data/` and is gitignored.
- `server/src/index.js` also serves `client/dist` (SPA fallback) so the whole app
  is reachable from one port in preview.

## Party combat (Wave 3C)

- `server/src/game/combat.js` builds combatants with `key`/`side`/`kind`
  (`leader|ally|enemy`)/`refId`.
- `startBattle` loads the leader's active party; every player-side member is
  human-controlled, turn order by speed. The enemy AI targets the lowest-HP
  living party member.
- Settlement applies leader XP/HP, companion XP, and permanent companion death
  (`party_members.status='dead'`). Defeat is survivable: the leader ends at 1 HP
  and loses 25% of gold unless the party still won.
- `battles.result` (JSON) stores the end-of-battle report; the Battle page reads
  it so the report survives a reload. Additive migrations live in
  `server/src/db/index.js#migrate`.
- Tests share one SQLite file, so they run serially:
  `npm --workspace server test` uses `node --test --test-concurrency=1`.

## World map, scenes and arena (Waves 4-5)

- `locations` carry `map_x`/`map_y`/`scene`/`biome`; migrations live in
  `server/src/db/index.js#migrate` and `seedWorld()` backfills map data into
  databases that predate the columns (no duplicates, keyed by location name).
- `GET /api/world/map` (see `services/world.js#getMap`) returns flat locations
  with coordinates plus undirected roads and per-location monster counts.
- Art is vector (SVG) except the map's paper: `client/src/WorldMap.jsx` is the
  interactive atlas (built on the CC0 parchment texture), `client/src/scenes.jsx`
  renders layered scene backdrops (biome palette + location-specific accents)
  reused by location cards, the location hero and the battle arena. Do not add
  other rasters.
- The arena in `client/src/pages/Battle.jsx` turns the engine's event stream
  into transient VFX (floating damage/heal numbers, hit shake, heal pulse,
  dodge, screen flash); `getBattleView` exposes the location's scene/biome.

## Dialogue, memory and the local AI (Wave 6)

The party and world inhabitants can be talked to. Every line is remembered, and
each character's attitude toward the leader moves with what is said.

- Pure engine: `server/src/game/dialogue.js` (topic classifier, trait-weighted
  `relationDelta`, mood buckets, fact extraction, reply composition). No I/O, so
  it is unit-tested directly.
- NPC design data: `server/src/game/npcs.js`; persistence and seeding:
  `server/src/services/npcs.js#seedNpcs` (idempotent, runs on startup).
- Orchestration: `server/src/services/dialogue.js` records both lines in
  `dialogue_messages`, distils durable facts into `dialogue_memory` (repeating a
  fact raises its weight), and moves the relationship. NPC opinion lives in
  `npc_relations`; companion opinion reuses `party_relations` (leader-targeted
  row). Both are clamped to 0..100.
- Routes: `server/src/routes/dialogue.js` — `GET /api/dialogue/options`,
  `GET /api/dialogue/:leaderId/:kind/:refId`, `POST .../say`, plus
  `GET /api/dialogue/status`.
- UI: `client/src/Talk.jsx` is a reusable panel wired into `pages/Location.jsx`
  (inhabitants) and `pages/Party.jsx` (companions). It shows the live relation
  meter, topic quick-prompts, remembered facts and per-line attitude deltas.

### The AI layer is optional and layered

`server/src/services/llm.js` produces the spoken reply, in order:

1. **local** — llama.cpp `llama-server` with Qwen2.5-7B-Instruct Q4_K_M.
2. **cloud** — any OpenAI-compatible endpoint, only if `LLM_CLOUD_KEY` is set.
3. **template** — the deterministic engine line, always available.

There are two paths, and the difference matters:

- **Free answer (`answerQuestion`)** — for open questions the player asks about
  the character, the world or a reason ("почему ты стала воином?", "чего ты
  боишься?", "расскажи о прошлом"). Here the model *authors* the line; the engine
  draft is a fallback that is **not** shown to the model, so it cannot echo a
  wrong template. This is what makes an NPC able to talk about anything.
- **Reword (`rewordReply`)** — for the recognised "safe" topics, the model
  rewords the engine draft. Volatile beats (insult, threat, apology, join) keep
  the engine's exact wording.

The briefing (`llmBriefing`) always carries the character's **backstory**
(`description` for NPCs, `history` for companions) and `className`, so the model
knows why, say, Марта became a warrior. The static instruction block
(`SYSTEM_RULES`) is a module-level constant and comes first in the system prompt,
with all per-turn data after it — llama.cpp reuses the cached prefix, so prompt
evaluation stays cheap instead of re-reading the whole brief every turn.

The local model is Qwen2.5-**7B**-Instruct Q4_K_M (two GGUF shards; point
llama.cpp at the `-00001-of-00002` file and it loads the rest). The 3B was tried
and answered correctly but flatter; the 7B is markedly more in character, so
reply latency (seconds) is deliberately not optimised for.

If nothing is running, dialogue still works. Config via env: `LLM_PROVIDER`
(`auto|local|cloud|off`), `LLM_LOCAL_URL` (default `http://127.0.0.1:8080`),
`LLM_MODEL_PATH`, `LLM_CLOUD_KEY`, `LLM_CLOUD_BASE`, `LLM_CLOUD_MODEL`,
`LLM_TIMEOUT_MS`.

A small local model drifts off-register, so the reword path only touches "safe"
topics; volatile beats (insult, threat, apology, join) keep the engine's exact
wording. Model output is rejected (falling back to the engine) if it is empty,
too long, mostly Latin, contains markup, uses the speaker's own name for the
listener, or drifts off the draft's subject. `tidyReply` also strips small-model
framing ("Вот мой ответ:"), stray Latin words, and a line cut off on a trailing
conjunction or preposition.

Models are never committed: `models/` is gitignored. Recreate the local layer
with `npm run llm:setup` then `npm run llm:start`. The weights are open and the
runtime is offline, so this layer has no API key and no expiry — it keeps working
as long as the machine does.

## Travel: the road between places (Wave 7B)

Roads are journeys, not teleports. `GET /api/world/map` and
`GET /api/world/locations/:id` expose `minutes` on every road; the client shows
"В путь" on each connection and sends the player to `/travel/:id`.

- **Minutes are derived, never authored.** `game/travel.js#travelMinutes` scales
  the drawn map distance by the average of both endpoints' terrain factors, so a
  longer road always takes longer and a road takes the same time either way.
  `seedWorld()` recomputes them into `connections.minutes` (including on old
  databases, via `backfillTravel`). Changing the map geometry therefore changes
  travel times on the next seed — do not hand-write minutes into `seed.js`.
- **Everything on a road is deterministic.** Encounters are re-derived from
  `hashString('<from>-><to>:<minute>')`, so a reload cannot reroll a roll and the
  journey state (`travels.state`) stores only `{ events, cursor, pending,
  walkedMs, segmentStart }` — how far the party is, not what it met.
- **The road runs on the real clock, not on clicks.** `MS_PER_MINUTE = 10_000`
  (10 real seconds per game minute). `elapsedWalkMs(state, now)` is
  `walkedMs + (now - segmentStart)`; `currentMinute` floors that. `tick()` moves
  the clock forward and pauses exactly on the minute a stop is due; `resume()`
  clears the stop and restarts `segmentStart`. There is no `advance` endpoint —
  the client just polls `GET /api/travel/:id`, and progress is a function of
  wall-clock time. Never add a click that moves time.
- **The client poll must outlive an encounter.** `Travel.jsx` re-polls
  `GET /api/travel/:id` every 2s until the view reports `arrived`, including
  while an encounter is pending; stopping the loop on a stop meant the bar never
  resumed after the player answered. The view is stamped with `fetchedAt` on
  every poll so the bar can interpolate smoothly between them. A 404 here only
  means the trip is gone, so the page returns to the map rather than freezing on
  an error.
- **Arrival is checked on read and on choice, and it is idempotent.** `hasArrived(state, minutes, now)`
  is `!pending && cursor >= events.length && elapsedWalkMs >= minutes*MS_PER_MINUTE`.
  Both `getTravelView` and `commit` call it: the moment it is true the trip is
  marked `arrived = 1`, `recordVisit()` marks the destination, and the view keeps
  reporting `arrived: true`. The row is kept on purpose — the client polls the
  road until it sees `arrived`, so the finishing poll must get that view rather
  than a 404 (deleting the row made the bar freeze at the end of every road).
  `startTravel` only reuses trips with `arrived = 0`, so a finished road never
  blocks the next one. A safe road with no stops therefore arrives on the first
  read instead of leaving a stuck journey.
- **One road per character.** `startTravel` returns the existing unfinished trip
  instead of replacing it; `travels.character_id` is not unique but is treated as
  such.
- **Encounters map onto what exists.** Outcomes are `gold` / `heal` / `mana` /
  `battle` / `nothing`; there are no inventory or potions, so merchants cost gold
  and inns/shrines restore resources. An ambush calls `startBattle` at the
  *destination*; it is wrapped in try/catch and degrades to a quiet outcome,
  because a road can end where no monster spawns.
- **`getLocation()` returns DB rows (`map_x`/`map_y`); the engine wants `x`/`y`.**
  Always pass coordinates through `services/travel.js#roadPoint` — feeding raw
  rows made every trip exactly `MIN_TRAVEL` (15 min).

## The map: a live in-game screen (Wave 7B, opened up in Wave 11)

The atlas is a real in-game screen, not a static picture. It carries a hero
marker and, since Wave 11, shows every place openly.

- **Position lives on the character.** `characters.location_id` (added by the
  `ensureColumns()` migration) and a `character_visits` table track where a hero
  stands and everywhere they have stood. `services/world.js#recordVisit` writes
  both; it is called on arrival (`services/travel.js`) and when a safe road is
  skipped (`POST /api/world/locations/:id/visit`). A hero with no location is
  lazily assigned the first safe place the first time the map asks.
- **`GET /api/world/map?characterId=`** adds a `character` block:
  `{ locationId, visited, travel }`, where `travel` carries live `minute`,
  `progress` and `paused` while a road is under foot. Without `characterId` the
  map returns the full atlas (used by tests and any pre-hero view).
- **The atlas is fully open (Wave 11).** `WorldMap.jsx` no longer hides places:
  every location is drawn with its name, landmark icon and danger pip, and every
  node is clickable. The old three-tier fog (visited / rumoured / unknown) was
  removed from both the map and the list — do not reintroduce it. The server
  still tracks `visited` and `travel`, and the party marker still walks the roads.
- **No decorative drawing of our own.** The map is the engraving plus the game
  layer only: inked roads, node seals, labels, the party cross. The compass,
  frame, vignette, sea hatching and hand-drawn relief are gone — the antique
  chart supplies all of that. Do not add them back.
- **The legend sits below the map, not on it.** `.map-legend` is in normal flow
  under `.map-wrap` (inside `.map-col`) so it never covers the south of the
  island or its labels. Only the distance note rides on the map, bottom-left.
- **The marker is interpolated, never stored.** `services/world.js` reports
  `progress` from the travel clock; the client places the dot on the same
  quadratic Bézier the roads use (`(a.x+b.x)/2, (a.y+b.y)/2 - 30`). It must match
  the drawn curve or the dot drifts off the road.
- **The atlas is a genuine antique chart with a vector overlay (Wave 10).**
  `WorldMap.jsx` no longer draws terrain. The base is a plain 18th-century
  survey of the island of Boero (Jakob van der Schley / Pieter de Hondt, c. 1753),
  public domain, served from `client/public/art/maps/isle-antique.jpg` and tiled via an SVG
  `<pattern id="antiqueMap">`. On top we keep only the game layer: hand-wobbled
  **roads** (`wobbleLine`) with a pale `HALO` underlay so ink reads over the dark
  engraving, **inked seals** with the licensed landmark icon, labels, the compass
  and the party cross. Do not reintroduce our own relief, washes or `seaHatch` —
  they competed with the engraving and muddied it.
- **The island clip is a hand-drawn coastline.** `coastline()` builds the closed
  ring that `landClip` uses to keep the fog-of-war wash on the land, and the
  locations are placed to sit inside it. If you ever swap the base map, re-check
  that all `map_x`/`map_y` still land on the new landmass.
- **Places are inked seals with a drawn pictogram** — actually now the licensed
  icon inside the seal (re-skinned through `SCENE_LANDMARKS` in `icons.jsx`:
  `hollow` → `quicksand`, `bone_field` → `dinosaur_bones`, `sunken_chapel` →
  `church`, `tide_caves` → `cave_entrance`, `ash_forest` → `dead_wood`,
  `black_spire` → `guarded_tower`).
- **The party is an inked cross** (`.party-x`), pulsing while it walks. Keep the
  chart calm: no scattered icons or "stamps" — an earlier attempt read as visual
  noise.
- **All of it stays vector — with two deliberate raster exceptions.** The map and
  icons are vector; the paper is a **CC0** texture (`textures/parchment.jpg`) and
  the base map is the **public-domain** Boero engraving above. Both are
  credited in `client/public/art/CREDITS.txt`. If you add art, keep it CC BY 3.0
  SVG from game-icons.net and credit the `<author>/<icon>` pair; do not add
  further rasters.
- **The list view mirrors the map.** `pages/World.jsx` also lists every place
  openly, so the two tabs never disagree.

## Testing rules (important)

- **Tests must never touch the live game data.** `server/test-support/env.js`
  points `DB_PATH` at a throwaway `server/test-support/.tmp/test.sqlite` and
  turns the LLM layer off. It MUST be the first import in every test file,
  before anything that opens the database or reads LLM config:
  `import '../test-support/env.js';`
- Never create scratch characters against the live database (`server/src/data/`).
  If you need to try something by hand, run it against the test DB by setting
  `DB_PATH` first, or through the API and delete it afterwards.
- Tests run serially (`node --test --test-concurrency=1`) because they share one
  SQLite file.

## Dialogue nuance: greetings vs caring questions

- A bare hello ("привет", "здравствуй") is topic `greeting`. A caring question
  ("как ты", "как дела", "как себя чувствуешь", "ты в порядке") is topic
  `wellbeing` and is matched **before** `greeting`, otherwise the word "привет"
  swallows the whole line.
- `wellbeing` is a small positive for most characters (never a penalty). It used
  to fall through to `smalltalk`, which gloomy/paranoid characters dislike, so
  asking someone how they were could cost you relationship — that was wrong.
- The LLM layer must not answer with a one-word stub. `accept()` rejects replies
  under three words and retries the local model once before falling back to the
  engine line, so "привет, как ты?" never comes back as just "Привет".

## Local AI rewording (Wave 6 follow-up)

- The LLM layer only ever rewords the **clean spoken line**. A remembered aside
  is appended afterwards (30% of the time, never twice in a row), otherwise a
  small model rewrites the mechanical aside and loses the actual answer.
- `llmBriefing` passes `playerText` so the model answers the real question
  instead of parroting the draft.
- `acceptReply` (services/llm.js) rejects: replies under 10 chars or 2 words,
  anything without Cyrillic, CJK/fullwidth/Arabic/Hebrew/Greek scripts, mostly
  Latin lines, and any line containing the speaker's own name **or a truncation
  of it** ("Март" for "Марта Вейл"). `rewordReply` retries the local model once
  with a nudge, then falls back to the engine line.
- Memory weight is capped at 5 and `memoryAside` only recalls weight >= 2, so a
  frequently repeated fact cannot monopolise every reply.

## Dialogue topics (invariants)

- `MOOD_LINES` must define a line for **every** topic in `TOPICS` in **every**
  mood. A missing key silently falls back to `default`, which once made a
  farewell answer with a battle line. The test
  "every mood answers every topic" enforces this.
- Battle readiness is its own topic (`battle`), matched by words like
  "сражени", "бой", "готов к", "в атаку". Before, "готов к сражению" fell
  through to smalltalk and the model just echoed it back.
- `acceptReply` also rejects a short reply that only mirrors the player's own
  words (>=60% shared content words, <=6 words), so "готов к сражению" cannot
  be answered with "Я готов к сражению!".
- A reply must share at least one four-letter stem with the engine draft; this
  catches hallucinated non-answers ("Ты гадкий" to "как ты сегодня?") while
  still allowing synonyms ("привет" ~ "приветствую").
- The reply seed counts only the character's own lines (`speaker='other'`),
  because each turn writes two rows and the parity used to get stuck.

## Answering "how are you?" (mood topic)

- A player *answering* "как ты?" — "да также, потихоньку", "нормально", "как обычно" — is the `mood` topic, not `smalltalk`. `smalltalk` had no real reply for it and gloomy listeners docked -2, which read as "you cannot just talk to a companion".
- `smalltalk` never changes the relationship (`TRAIT_REACTIONS.smalltalk = {}`); empty chatter is neutral, not an offence.
- "хорошо"/"отлично" are deliberately absent from the mood patterns: they belong to the `compliment` topic and would otherwise hijack "Ты отлично держишься".
- The UI badge shows "ответ: движок (характер)" whenever Qwen was not used — either the topic is intentionally engine-only (insult/threat/apology/join) or the model's line was rejected by `acceptReply` and the draft was kept.

## Free answers (open questions)

- Any real question that is not a recognised beat — "почему ты стала воином?",
  "чего ты боишься?", "расскажи о прошлом" — classifies as topic `question`
  (`DEEP_QUESTION` in `game/dialogue.js`) and is answered by the model directly
  via `answerQuestion`, not by a canned beat. This is what stops the old failure
  mode where a misclassified question made Qwen faithfully rephrase the *wrong*
  template ("почему решила стать воином" → "мне тоже кажется, что здесь пусто").
- A short social beat with a question mark ("как ты?") keeps its reliable canned
  reply: `freeAnswer` is true only for a deep question or a line classified as
  `question`, never for `greeting`/`wellbeing`/`mood`/`farewell`.
- `question` is in `TOPICS` and every mood defines `MOOD_LINES.question`, so the
  engine fallback (when no model is reachable) is still in character — the
  "every mood answers every topic" test covers it.
- On the free path the engine draft is a **fallback only** and is not put into
  the prompt, so the model cannot echo it. `answerQuestion` returns null on any
  failure and the caller keeps the engine line.
