# AGENTS.md ‚Äî Deeprealm site

Instructions for any OpenHands chat or sandbox working on this repository.

## What this repo is

The Deeprealm RP-chat website: lore, rules, races, classes, level pass,
administration, the AI Guide (–ü—Ä–æ–≤–æ–¥–Ω–∏–∫) and the AI application interviewers.
Node + Express, no build step. Node >= 18.

- `server.js` ‚Äî Express app and API endpoints (`/api/knowledge`, `/api/chat-link`,
  `/api/guide`, `/api/interview`, `/api/staff`, `/api/refresh`, `/api/status`).
- `public/` ‚Äî static frontend (`index.html`, `app.js`, `styles.css`).
- `data/knowledge.json` ‚Äî all site content. Edit this to change lore, rules,
  races, classes, level pass and administration.
- `blog-sync.js` ‚Äî pulls player-made races/classes from the Deeprealm blog.
- `test/server.test.js` ‚Äî test suite.

The live site is deployed from this repository, independent of any sandbox.
Never treat a `*.prod-runtime.all-hands.dev` URL as the real site; those are
temporary and die with their sandbox.

## Local run and test

```bash
npm install
npm test          # NODE_ENV=test node --test test/*.test.js
npm start         # http://localhost:3000, override with PORT
```

AI endpoints need no key. `ai-engine.js` is the site's own engine: it retrieves
the right part of `data/knowledge.json` and the player races/classes read from the
blog and answers with no network. `LLM_API_KEY` in `.env` (see `.env.example`) is an
optional wording upgrade; without it the chats still answer, so a missing or expired
key is never a failure. The browser bundle (`public/chat-browser.js`) carries the
same engine, which is why the static site answers too.

## Deploy model

`render.yaml` + `Dockerfile` define the service. The host auto-deploys every
push to `main`, so publishing = pushing to the repo. Configuration lives in
host environment variables, not in the repository. `LLM_API_KEY` is set once in
the host dashboard and never committed.

## Updating the site from any chat or sandbox

The canonical source of truth is this git repository. A sandbox is just an
editor. To publish the current workspace of any conversation:

```bash
REPO=<owner>/deeprealm-site CONV_ID=latest \
  python3 scripts/sync_from_conversation.py
```

`CONV_ID=latest` uses the newest conversation; pass a specific conversation id
to publish from an older one. The script resumes that conversation's sandbox,
pulls its workspace as a patch, and pushes the resulting commit to `main`.
Whatever host deploys the repo then updates the live site automatically.

Alternatively `git push` directly if you already have the repo checked out.

## Content changes

Most requests are content, not code. Change `data/knowledge.json`, run
`npm test`, then publish. Keep the JSON shape stable ‚Äî `public/app.js` and
`server.js` read these keys directly.

## Notes

- Do not commit `.env` or any API key. `.gitignore` already excludes `.env`.
- `README.md` describes the site for its owner; keep it in sync with features.
- When a test asserts a 503 for unconfigured AI, run tests with `NODE_ENV=test`
  (as `npm test` does) so a local `.env` key does not change the outcome.
- `test/dom.test.js` runs `public/app.js` in jsdom, so it covers the chat
  persistence, multi-chat and message-action code that the server tests cannot
  reach. Keep it passing when touching the frontend.

## Animated scene (`public/scene.js`)

The background is a canvas painting: a keep on a cliff, moon, stars, mist and
embers, with a light parallax on pointer move and scroll. Things to know before
changing it:

- It paints into a backing store of `viewport + 140px` so parallax never
  exposes an empty edge. Keep that slack if you add layers.
- Layers are baked once per resize (`skyLayer`, `terrainLayer`, `vignette`);
  only twinkling stars, window lights, mist and embers are redrawn per frame.
  Avoid adding per-frame work that touches the whole canvas.
- It runs at most at 1.5 device pixel ratio, and stops rendering while the tab
  is hidden. `prefers-reduced-motion` renders a single static frame instead.
- The scene lives at `z-index: 0`, the `.scene-veil` gradient at `1`, page
  content at `2`. Body text sits on `.card`, which has its own solid
  background, so the scene never has to be darkened for readability.
- `--ink-dim` is deliberately light (`#c2b5a4`): the older `#a99c8a` only
  reached about 4.7:1 against the panels. Check contrast before darkening any
  colour here.
- The section below the keep's base is pure black `#050409`, so the towers read
  as a silhouette. Keep them dark and let the warm glow behind the keep (drawn
  in `makeSky`) supply the edge.

### Dark-fantasy layer (added 2026-09-27)

This was a request to make the site more dark fantasy by *adding*, never by
changing what was there. Keep that rule: the additions must be removable
without restoring any old value.

- `scene.js`: the keep gained a rear wall, far turrets, moonlit rim light on the
  roofs, spires with hanging banners, parapets, more lit windows, and a
  torch-lit bridge from the gate. The sky gained baked violet nebula streaks.
  The terrain gained bare wind-bent trees (`deadTree`, a seeded recursion). A
  distant winged silhouette (`dragon`) crosses the sky. All of it is baked into
  `skyLayer`/`terrainLayer` except the dragon, which is one shape per frame.
- `styles.css`: the block after `.article-body p.gap` is the whole addition.
  It carries drifting fog (`body::before`), a light film grain (`body::after`),
  rune rules under `.page > h2` and `.card > h3`, card corner marks and an
  inner glow, arcane list markers, an ember-lit scrollbar/selection, and a
  slow-burning active-tab underline. Colours, fonts and sizes are unchanged.
- The fog and grain go on `body::before`/`body::after` at `z-index: 1`: same
  plane as `.scene-veil`, still under content at `2`. Do not raise them.
- Both new CSS animations are disabled under `prefers-reduced-motion`. In the
  canvas, `still` draws a single frame, so the dragon holds at its t=0 position
  there rather than crossing; that matches how the rest of the scene behaves.
- The dragon sits between the stars and `terrainLayer`, so the keep and trees
  occlude it and it reads as distance rather than as a foreground object.

### Rooms inside the keep (added 2026-09-27)

The background is no longer one painting. `scene.js` now holds a registry of
rooms and the page picks one per section, so walking the site walks the castle.
Keep this in mind before touching the scene:

- The original courtyard drawing is unchanged; only its structure moved. Its
  builders are `courtyardSky` / `keep` / `courtyardTerrain` / `courtyard`, and a
  diff of the courtyard render against the old single-scene build showed 0.04%
  of pixels differing, all of it noise in the embers.
- Four rooms: `courtyard`, `library`, `guild`, `throne`. Every one is a plain
  function returning
  `{ sky, terrain, lights, puffs, embers, twinklers, gateX, skyF, terrF, dragon }`.
  Add a room by writing that function and listing it in `ROOMS` and `BUILDERS`.
- `window.DeeprealmScene` is the only interface: `setRoom(name)`, `getRoom()`,
  `rooms`. `app.js` owns the page -> room map (`ROOM_FOR_PAGE`) and calls
  `setRoom`. An unknown name falls back to the courtyard, so a typo cannot
  blank the background.
- Rooms are baked lazily on first visit and the rest are prepared while idle.
  `MAX_CACHED` is 3 and the least recently used room is evicted; each room is two
  full-size layers, so caching all four would quadruple the old memory. Never
  drop the room currently in view.
- Per-frame work is still only: twinkle, the dragon (courtyard only), light
  flicker, mist, embers and the vignette blit. Everything architectural is baked
  once per resize. A room must not add per-frame drawing of its own.
- Baked layers are cheap: measured at 5-16 ms per room at 1280x900, so a room
  being built on entry is hidden behind the doorway.

The doorway itself is in `index.html` (`#doorway`), `styles.css`
(`.doorway...`) and `app.js` (`enterRoom`). It closes over the page, the room
swaps underneath, then it parts - so a room change is never seen mid-frame.
- It is `position: fixed` at `z-index: 15`, under the header (`20`) and over the
  content (`2`), with `pointer-events: none` so it never eats a click.
- The two leaves are `::before`/`::after`, so no extra nodes; the runes and the
  lit arch are the two spans.
- Only `showPage` starts a transition. The first page takes its room directly
  (no door over a page the visitor has not left) and a re-render that stays in
  the same room, such as a language switch, is skipped. Check both if you change
  `showPage`.
- Under `prefers-reduced-motion` the overlay is `display: none` and the room
  changes instantly; the still frame is redrawn in `setRoom`.
- Timings: leaves close in 330 ms, the swap happens 120 ms later, the leaves
  part over 460 ms (`DOOR_CLOSE_MS`, `DOOR_HOLD_MS` in `app.js`).

## Publishing to GitHub

The sandbox token is a GitHub App installation token. Its permission set is
narrow, and the exact set matters:

- **Contents: Read and write** is required to push commits at all. Without it
  every write fails with `Resource not accessible by integration` even though
  `GET /repos/:owner/:repo` reports `permissions.push: true`. Do not trust that
  field; probe with a real write (`PUT /contents/...`).
- **Workflows: Read and write** is additionally required because this repo
  tracks `.github/workflows/dependabot-auto-merge.yml`; a push touching that
  path is rejected without it.
- `Repository creation: write` is only needed to create the repo itself. If the
  owner creates an empty repo by hand, this permission is unnecessary.
- `/user/installations` reports `total_count: 0` for this token even when the
  installation is healthy, so it cannot be used to diagnose access.

Grant these at https://github.com/settings/installations -> Configure ->
Repository permissions. Verify before a long operation with:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -X PUT \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H 'Accept: application/vnd.github+json' \
  https://api.github.com/repos/<owner>/<repo>/contents/probe.txt \
  -d '{"message":"probe","content":"aGVsbG8="}'
```

`201` means writes work; `403` means the permission is still missing.

## Permanent hosting

`*.prod-runtime.all-hands.dev` links die with their sandbox, which is why a
sandbox error used to make the whole site unreachable. The site is meant to run
on a real host (`render.yaml` + `Dockerfile` are ready for Render; any Docker
host works). Deploy once, then publish updates from any sandbox or chat with
`scripts/sync_from_conversation.py`. Never point users at a sandbox URL.

## Publishing access (resolved 2026-09-25)

The code is on GitHub as of commit `a1678eb`. Getting there needed a token the
owner created by hand; the agent's own `GITHUB_TOKEN` cannot write to this repo
(see the trap below). Two things about publishing here:

- A **classic** token with the single `repo` scope is what worked. Fine-grained
  tokens were tried twice and both times every write returned
  `Resource not accessible by personal access token` - including creating
  issues, labels, and patching the repo. The permission grid on the fine-grained
  page is easy to leave unset, so prefer the classic token.
- Pushing `.github/workflows/` needs the extra `workflow` scope. The first push
  was rejected for exactly that reason, so `dependabot-auto-merge.yml` is
  deliberately **not** in the initial commit. Add it later, once a token with
  `workflow` scope is available.

`AGENTS.md` and `.github/` are in `.dockerignore`, so the image never carries
them.

### Trap: do not trust `permissions.push`

`GET /repos/:owner/:repo` reports `permissions.push: true` even for a token that
cannot write a single byte, and `GET /user/installations` reports
`total_count: 0` even for a healthy installation. The only reliable check is a
real write: `PUT /contents/probe.txt` - `201` means writes work, `403` means the
permission is missing. Probe that way before starting any long operation.

## Operational notes (learned 2026-09-25)

- The two sandbox preview URLs map to fixed ports: `work-1` -> 12000,
  `work-2` -> 12001. Opening the wrong one shows "Bad Gateway" (502), which
  looks like a crash but only means nothing is listening on that port. Start the
  server on **both** ports so either link works, since the owner may open either.
- Never stop the preview server while the owner is still looking at the site.
  Cleanup steps must only remove scratch files. Killing `node server.js` was
  what produced the "Bad Gateway" the owner reported.
- Start the server detached so it survives the shell command that launched it:
  `PORT=12000 setsid nohup node server.js > /tmp/local.log 2>&1 < /dev/null &`
- Sandbox hostnames change when a paused sandbox is resumed. An old
  `work-1-<old-sandbox-id>.prod-runtime.all-hands.dev` link returns **404**,
  not 502. Re-read `exposed_urls` from the sandbox API after a resume.
- Pausing a sandbox kills the site process; it does not come back on resume.
  Restart with `node server.js` after waking the sandbox.
- The agent-server shell may still export stale `LLM_*` variables from an
  earlier session. `server.js` only reads `.env` when a variable is unset, so a
  restart inherits the old models and keeps returning 429. Unset
  `LLM_MODEL LLM_FALLBACK_MODELS LLM_API_KEY LLM_BASE_URL` before starting.
  A stale key no longer breaks anything: every model failure falls through to
  `ai-engine.js`, so the chats answer from the knowledge base either way.
- Verified working Gemini models on the free tier: `gemini-flash-lite-latest`,
  `gemini-3.5-flash-lite`, `gemini-3-flash-preview`. `gemini-3.6-flash` and
  `gemini-3.7-flash` do not exist.
- `ai-engine.js` (added 2026-09-26) is the site's own keyless AI: it builds
  documents from the knowledge base plus the player races/classes read from the
  blog, retrieves by stemmed tokens
  with IDF weighting, and phrases the answer. The Guide, Interviewer and Staff
  handlers in `chat-answers.js` call the model only as an upgrade and always
  have the engine behind it. `scripts/build-chat-browser.js` bundles the engine
  into `public/chat-browser.js`, so the same answers work offline.

## The Interviewer authors races and classes on request (added 2026-09-27)

- The Interviewer must be able to *create* a race or a class itself, not only
  walk the player through a checklist. `ai-gen.js` is that generator: a keyless,
  model-free set of themed race/class blocks whose abilities always come with the
  weaknesses that balance them, so every generated sheet satisfies
  `races.race_template_rules` and `classes.class_balance_rules` by construction.
- `ai-engine.js` routes "придумай мне расу сам" / "создай мне класс сам"
  (`isSelfMade` + `RACE_INTENT`/`CLASS_INTENT`) to the generator through
  `generatedSheet`, which returns the finished sheet. `chat-answers.js` merges
  that sheet into the draft, so the next "проверь" approves and forwards it with
  no further questions.
- "Я сам создам расу" (the player writes it) must keep opening the walk, so
  `isSelfMade` excludes a leading "я сам". A request must name a race or a class;
  a bare "сделай" mid-walk stays on the checklist.
- The player's own idea wins over a random theme (added 2026-10-19). When the
  opening request carries the race's nature ("полу люди, полу нежить", "ледяные,
  что живут в горах"), `generatedSheet` builds the race from it at once instead
  of answering with a form that ignores the idea — the bug the owner reported as
  "он не слушает игрока". `raceConceptFrom` pulls the idea out of the dialogue,
  `RACE_NATURE` (shared from `ai-gen.js`) tells a concept request from a bare
  "хочу расу", `themeIndexForConcept` picks the theme whose words the idea
  matches, and the idea is quoted as an `Идея игрока` line in the sheet and the
  draft. A bare "хочу расу" has no nature word, so it still opens the walk, now
  with an added "опиши идею одной фразой" hint.
- The player can revise the sheet mid-walk (added 2026-10-19). "Давай поменяем
  название на «лёд»" used to fall into the generic reaction, so the bot answered
  "Хороший вопрос" and asked the next field — the edit was silently dropped, the
  "он не слушает игрока" complaint again. `parseFieldEdit` (exported from
  `ai-engine.js`) reads the edit verb, the field alias and the new value, the
  `localInterview` branch confirms it ("Записал: Название → «лёд»"), and
  `answerInterview` stores the value in the draft, so the next "проверь" hands off
  the renamed sheet. The preposition must sit right after the field name, so an
  ordinary answer that merely mentions a place is not mistaken for a revision.
- "Finish the rest for me" mid-walk is honoured (added 2026-10-19). "Хорошо...
  Можешь сам всё дальше придумать?" used to fail the noun gate in `generatedSheet`
  (it names no race), so the interviewer answered "Хороший вопрос" and offered the
  very same handover back. `finishSheet` recognises the handover inside a race/class
  walk (`FINISH_REQUEST`: "сам всё/остальное/дальше" + a make verb, "за/для меня"),
  generates the sheet, and keeps the fields the player already filled — the name
  they chose and the abilities they wrote survive, the balance rules supply the
  rest. `answerInterview` folds it in beside `generatedSheet`. The verb list is
  explicit so an ordinary answer with "сами" ("они сами по себе") is not a handover.
- Generated classes carry two abilities on every level 1–15 and short cooldowns
  (added 2026-10-19). The owner: "До 15 уровня должно быть не меньше 2 способностей"
  and "надо чтобы анкетолог не делал такие большие перезарядки". The sheet used to
  list one ability per level for the first twelve levels, then jump to the ultimate,
  so levels 13–15 had none, and cooldowns ran up to 8 turns. `classAbilityLines` now
  emits the theme's signature ability plus a role utility on every level
  (`utilityAbility`, role read from the theme wording by `themeRole`; the three levels
  past the theme's twelve use `heavyAbility`), and cooldowns are capped at 4 turns for
  base abilities and 5 for specializations (`ABILITY_CD_CAP` / `SPEC_CD_CAP`). A stored
  cooldown already short is kept as is. A stated requirement ("до 15 уровня …",
  "перезарядки не должны быть большими") is acknowledged by `ruleRequirement` instead
  of being brushed off with "Отлично, вот это уже деталь".
- Base cooldowns are capped at 2–3 turns and are not on every ability (added
  2026-10-19). The owner: "на уровнях до 15 должно быть максимум 2-3 хода
  перезарядка. На других уже может быть больше. И перезарядка должна быть не везде".
  `ABILITY_CD_CAP` is 3 for base abilities (specializations keep `SPEC_CD_CAP` 5), and
  the role utility on each level carries no cooldown at all, so only the signature
  ability and the ultimates have one. `ruleRequirement` also has a branch for the
  "не везде" wording, and it now runs in `localInterview` before `isAdviceAsk`, because
  the owner's sentence contains "может быть" and used to be swallowed by the generic
  advice dump. The cooldown matcher tolerates the "перезорядку" typo.
- The Guide answers about specializations and prints the full template (added
  2026-10-19). Two reports: "просил рассказать о специализациях мага — выдавал только
  краткое описание самого мага", and "засунь полную анкету, а не сократи её". The
  plural "специализациях" stemmed differently from the stored "специализации", so the
  question fell back to the class overview; `stem` now folds `иях/иям` like `иями`, the
  spec document lists the three directions plus their article links, and a `spec-all`
  document answers the class-agnostic question. `fullCharacterTemplate` renders the
  whole sheet (both stat blocks, from the knowledge base), used both by the Guide when
  `wantsTemplate` matches and by the stored template document, so the shortened form is
  never printed.
- A class requested for a race with no name asks which race (added 2026-10-19). The
  owner's question: "сможет ли ии сделать класс для расы игрока". `raceNameFor`'s
  history fallback had `/i` on a pattern whose first group is `[A-ZА-ЯЁ]`, so the
  lower-case "игрока" was read as the race name and a free-floating class was built.
  The flag is gone, a `NOT_A_RACE_NAME` stop-list covers "расы игрока / мою расу", and
  `isClassForRaceAsk` routes the unnamed case to a "назови расу" question. The stat
  list in `data/knowledge.json` was aligned with the owner's template ("Здоровье" in
  the physical block, "Хитрость" in the intellectual one).
- A generated class follows the player's idea, and a race can be built for a class
  (added 2026-10-20). The owner: a player asked the Registrar for a class for a
  half-human, half-undead race and got "Громовой заклинатель" — the class ignored
  the race's nature because `classDraft` picked its theme from the seed alone.
  `CLASS_THEME_HINTS` now scores the idea's words (нежить/кост → the bone kit,
  лёд → the frost kit, гром → the storm kit), `classConceptFrom` pulls the idea out
  of the dialogue (also from an earlier turn, e.g. "хочу класс" then "идея: полу
  нежить"), and the idea is quoted as an `Идея игрока` line. The mirror path is new:
  "сделай расу под громового заклинателя" builds a race whose nature matches the
  class (`generateRaceForClass` + `RACE_FROM_CLASS_HINTS`, `classNameFor`,
  `isRaceForClass` / `isRaceForClassAsk`), and an unnamed class draws a "назови
  класс" question. When a request names both kinds ("создай класс по расе X",
  "сделай расу под класс X") the noun after the creation verb (`primaryNoun`) decides
  which sheet is built. A check/show/add turn never authors a fresh sheet, so the
  "проверь" after a generated sheet still hands off instead of building a second one.
- A class is built for a race the player already has (added 2026-10-25). The owner: a
  player pasted a finished race and asked for a class for it, and the Registrar would
  not build one; a player who named their own blog race ("разумные растения") got no
  class either. `corpusNames`/`corpusNameIn` now read the race and class names from the
  knowledge base (`races.list`, `races.details`, `races.player_races`,
  `classes.base_classes`, `classes.player_classes`), so a bare name counts without the
  literal "раса"/"класс" word, and the trailing vowels are stripped so inflections
  ("для синтетиков", "для драконорождённого") match. `raceNameFor`/`classNameFor` walk
  the dialogue newest-first, so a sheet pasted a turn earlier still names its race, and
  `raceNameFromPhrase` reads a lower-case name after "расы" without mistaking "расы
  игрока" for one. `isClassForRace` also recognises the pronoun form ("сделай для этой
  расы класс") and, when a race walk is remembered, "сделай класс для неё". A generated
  class now takes its theme from the race name (`classDraft(..., themeText)`), so a fire
  race draws the fire kit. `interviewKind` lets only the newest non-command message's
  pasted sheet set the kind, so a class built from a pasted race is still filed as a
  class, and `detectSheetKind` resolves a race/class marker tie with the draft's kind.
- A request to answer in a few words gives the gist (added 2026-10-19). The player
  asked "А можно ты просто расскажешь в двух словах?" and the Guide re-printed the
  whole branch description, which reads as "he did not listen". `localGuide` now
  recognises the brevity ask (`в двух словах`, `вкратце`, `покороче`, `сократи`, …),
  folds the previous player turn into the query so the topic does not drift, and
  returns `briefDoc`: an admin branch is summarised from its own `main` + `pace`
  fields, anything else from its first two sentences. The full answer is unchanged
  when the ask is absent.
- "В двух словах про специализации" gives each direction's essence (added 2026-10-19).
  The owner asked "можно в двух словах рассказать что это за специализации?" and got
  only the three names plus a raw link. `data/knowledge.json` now carries a one-line
  `classes.specialization_briefs` per direction (from the blog's own "Описание:"),
  `base_classes[name].brief` and `races.briefs`. `briefDoc` renders per entity: a
  specialization class lists all three with their essence, a base class/race prints
  its one-line brief, the race and class overviews return the compact list, and a
  player race/class read from the blog falls back to its own opening lines (the
  "Название народа/класса" line is dropped). The same briefs are in the model context
  (`КРАТКО О КЛАССАХ`, `КРАТКО О РАСАХ`, `КРАТКО О СПЕЦИАЛИЗАЦИЯХ`) and the Guide
  prompt (rule 3г), so the live model answers the same way. `knowledge-view.js` passes
  `races.briefs` through for the static build.
- Race profiles, class abilities and specialization abilities are real data pulled
  from the blog (added 2026-10-20). The owner reported three wrong answers: "как
  выглядит эльф" returned the race *relations* ("К Людям: Снисходительность…"),
  "способности первого уровня" returned the *level pass* rewards, and a
  specialization had no answer of its own. `data/knowledge.json` now carries
  `races.details` (each base race's Внешность / Образ жизни / Боевые особенности /
  Уязвимости / … fields), `classes.base_classes[name].levels` (the 1–15 ability list)
  and `classes.specializations_detail[name].levels` (the 16–50 abilities). The Guide
  routes a looks question to the profile (appearance first), a level question to that
  level's abilities, and a named specialization to its essence + abilities. The race
  profile document is added before the relations so a plain "расскажи про эльфа"
  gets the profile; the relations keep their own document and answer "а отношения?".
- The Guide resolves follow-ups. "А как выглядит он?" and "а уязвимости?" carry no
  entity, so the previous player turn is folded into the query; a field-naming
  follow-up shows only that field. `guideReference()` hands the live model the exact
  same source text, so the model path cannot fall back to the wrong document.
  The terse "Способности 14" (no word "уровень") is read as level 14 too.
  A question naming several classes at once ("способности 15 уровня мага и 10
  некроманта") is split into one answer per class, so none is dropped.
- A longer anaphoric follow-up ("А чем они отличаются от других расс?", "а какие у
  них плюсы и минусы?") names no entity either. When it carries a comparison or a
  pronoun, the previous turn is folded in as well; for a race the comparison answer
  is its essence (strengths and weaknesses) plus its relations with each other race,
  not the appearance list repeated. Without this the retrieval left the race and
  returned the character template. The list check is narrowed to a category word
  next to "какие/список" so "какие у них преимущества" is not read as a request for
  the races overview.
- A comparison that names its subject ("чем люди отличаются от других", "чем маг
  отличается от других классов") forces the named race or class to the front of the
  hits. The everyday plural ("люди") and the short stem ("маг") are not the stored
  key ("Человек", "Маг"), so the right profile could lose the match and the answer
  compared a different entity. `RACE_ALIASES` / `CLASS_ALIASES` map the written
  forms to the base name; matching is boundary-aware (`hasWord`) so "маг" does not
  swallow "магия". The classes' comparison shows the essence, resource, attack and
  specializations - a class has no relations, its branches are how it differs.
- The aliases also canonicalise class names for the per-level ability list
  (`abilityRequests` -> `canonicalName`), so "способности 15 мага" still finds the
  "Маг" document after "мага" was added as an alias.
- A question naming two entities of one kind ("чем люди отличаются от орков", "чем
  маг отличается от воина") is a head-to-head, not a generic comparison. The first
  name is the subject, the second the one measured against; answering the second was
  the bug behind "он пишет про орков, а спросили про людей". `raceNamesIn` /
  `classNamesIn` return every name ordered by first mention, and `renderRaceVersus`
  / `renderClassVersus` lead with the subject, then the two sides' views of each
  other (for races) or both profiles (for classes).
- The noun is matched loosely (`рас+[а-яё]{0,3}`, `класс?[а-яё]{0,3}`) because
  players type "рассу" and "клас" as often as the dictionary spelling. A strict
  "расу" was the bug behind "he keeps asking me to describe the race": the typo
  never matched the intent, so the request fell through to the character walk.
  The `{0,3}` cap keeps "расскажи" (too long) from matching, so a plain question
  about races is still a question, not a build request.
- The interviewer is conversational: `interviewerReaction` prefixes a short human
  reply ("Записал", "Отлично, вот это уже деталь") before the next field, and
  `isHelpAsk` answers "а как мне создать расу?" with `howToMake` (the two ways:
  describe it yourself, or ask the AI to make it). The help check runs before the
  walk branch, so a question is explained instead of silently opening the walk.
  A reaction must carry no «...» of its own, or tests that read the last «...» as
  the asked field would see the reaction instead. Partway through a race or class
  walk the interviewer also offers to finish the sheet itself, so the player can
  hand the work over at any point instead of only at the very start.
- A generated sheet is shown exactly as built and is never handed to the model
  (see the `made` branch in `answerInterview`): a rewrite could paraphrase its
  numbers or drop an ability, so the player would submit something else than they
  read.
- `scripts/build-chat-browser.js` bundles `ai-gen.js` *before* `ai-engine.js`.
  The bundle flattens every module into one scope, so a helper name in a new
  module must be unique (`pick` in `ai-gen.js` is `genPick`); a duplicate
  `const` breaks the whole page at parse time, not just the new code.

## Player races/classes live from the blog (added 2026-09-27)

- The site no longer has an Articles page, an article store or article
  publishing. `public/index.html` has no `#articles` section and the removed
  modules (`articles.js`, `article-store.js`, `article-hydrate.js`,
  `github-publish*.js`, `scripts/import-articles.js`, `data/articles.json`) must
  not come back.
- Races and classes live in the blog. `blog-reader.js` reads the list and the
  full post text in the browser through Blogger JSONP (`alt=json-in-script`),
  which needs no server and no CORS headers. `public/app.js` seeds the pages from
  the `data/knowledge.json` snapshot, then merges the live list over it, so the
  pages are never empty and a new post appears with no rebuild. `blog-sync.js`
  still refreshes the snapshot server-side on `BLOG_SYNC_MINUTES` for the
  Node host; that path is optional.
- An approved sheet is handed to the owner, never published by the site:
  `chat-answers.js` returns no `published` field and `publish.js` only detects
  the sheet kind (`detectSheetKind`). The owner posts it in the blog, and the
  pages pick it up. Keep `publish.js` and `setSheetDetector` wired in tests.
- The GitHub Pages URL must stay `https://grigoriy131112-sketch.github.io/deeprealm-site/`
  with its `#levelpass` deep link. `docs/404.html` recovers `#levelpass` and the
  other current sections; do not re-add `#articles` there.

## Permanent site and auto-publishing (added 2026-09-25)

- The permanent site is GitHub Pages from `main` / `docs`, not a sandbox URL.
  `docs/` is generated by `npm run build-pages`; never edit it by hand.
- The site publishes its own pages only. Race/class sheets are no longer written
  to a data file or pushed by a bot: the owner posts them in the blog and the
  pages read the blog live (see the section above). `data/articles.json`,
  `github-publish.js` and `github-publish-api.js` are gone, so there is nothing
  to hydrate or commit on approval.
- `server.js` reads `.env` only for variables that are still unset, and the
  running preview servers do not reload code: restart them after editing.

## Hosting on a real server (added 2026-09-25)

- The permanent site is GitHub Pages from `main`/`docs` for pages only; the AI
  chats need a real host. `render.yaml` + `Dockerfile` are ready for Render.
- The owner must do the one step an agent cannot: sign in at render.com with
  GitHub and add the `LLM_API_KEY` secret. It is marked `sync: false` in
  `render.yaml`, so the host prompts for it. `GITHUB_TOKEN` is no longer needed
  for publishing sheets, since the site no longer pushes them.
- The container filesystem is wiped on redeploy, so the server-side blog sync
  (`blog-sync.js`) writes the refreshed race/class snapshot into
  `data/knowledge.json`. A lost snapshot is not fatal: the browser reads the blog
  directly, and the bundled snapshot in `docs/data/knowledge.json` is the
  fallback, so the pages are never empty.

## Blog post slugs (historical, fixed 2026-09-25)

- Blog URLs end in a generic `blog-post.html`, so a slug derived from the URL was
  the same for two different posts (`–ú–∞–≥–∏—Å—Ç—Ä —Å—Ñ–µ—Ä` and `–ê–¥–º–∏–Ω–∏—Å—Ç—Ä–∞—Ü–∏—è`). The old
  article store matched on slug and one entry overwrote the other. That store is
  gone; the current blog reader keys entries by their own post URL
  (`mergeEntries`), so two posts can never collide.

## Owner notifications and live speech (added 2026-09-26)

- The site's AI has two layers, and both are keyless. `ai-engine.js` always
  answers from the knowledge base and the player races/classes read from the blog.
  `ai-maker.js` then asks a
  free keyless model to rewrite that answer in a natural voice. The second layer is
  optional: a dead endpoint means the engine's own text is used.
- A rewrite is only accepted when `keepsEssentials` passes: it must keep the chat
  link, the trailing ¬´–∫–æ–Ω–µ—Ü¬ª and the ¬´–û–î–û–ë–Ý–ï–ù–û¬ª/¬´–Ý–ï–ö–û–ú–ï–ù–î–û–í–ê–ù¬ª mark, and add no
  markdown. Do not loosen this without a reason - it is what stops the free model
  from inventing lore or stranding a player without the chat link.
- Never make the live layer load-bearing. A failure opens a 10 minute cooldown and
  one request runs at a time, so a broken endpoint costs one timeout and nothing
  after it. The same rule applies to the free `FREE_LLM_*` path (5 minute breaker).
- `telegram.js` sends owner notifications. With no token it is a no-op that
  reports `skipped`; it must never throw into a chat. On the server the bot token
  lives in `.env` / `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` and never in a
  tracked file. `data/telegram.json` (also copied to `docs/`) is public and holds
  only `relay.url`/`relay.key`.
- Notifications cover four things the owner asked for: every site visit
  (`/api/visit`, throttled per browser session), every approved character/race/
  class sheet, every answer a staff candidate gave (paired question → answer), and
  every finished dialogue (`/api/dialog`). The visit and the dialogue ping are sent
  only once the handle is known: a visitor who has not passed the gate has no handle
  to report, and sending first without it would throttle the ping that does carry
  the handle.
- The finished-dialogue notification is sent when a chat reply comes back with
  `finale: true` (the player said "конец"/"finish", or the sheet was accepted). The page
  builds the transcript from the conversation's own messages, labels the speaker
  with the stored handle and the assistant with its role name, and reports it once:
  the `finished` flag is stored with the conversation, so a reload or a follow-up
  message cannot resend the same transcript. The owner's message reads
  `Пользователь: <ник> закончил диалог <ассистент>` then `Вот диалог:`
  and the transcript.
- An approved interview now forwards the sheet to the owner, so `handoffText`
  no longer sends the player to an application desk. The closing line comes from
  `sentToOwnerText`: it says the sheet was sent, or names the owner when delivery
  failed. Never claim delivery that did not happen.
- On GitHub Pages there is no server, so the page cannot hold the bot token. It
  posts to the owner's server at `POST /api/notify` with the `X-Relay-Key` header,
  and the server forwards to Telegram. The relay key is useless without the
  server, so the bot stays private. With no `RELAY_KEY` set the route answers 401
  - it must never become an open relay. `scripts/build-pages.js` treats
  `data/telegram.json` as optional, because a checkout without it must still build.
- `public/app.js` treats only a 2xx `/api/visit` as "our server handled it";
  static hosting answers `/api` with its own 404 page, which is a response, not a
  rejection, and would otherwise silently swallow the visit ping.
- The Cloudflare Worker relay is deployed **by hand**, separately from Pages: the
  owner pastes `deploy/cloudflare/worker.js` into the dashboard via the
  `worker-copy.html` page and clicks Deploy. Pushing to `main` updates the Pages
  site but **not** the running Worker, so a field added to a message shape (the
  nick, the finished dialogue) is silently dropped until the Worker is pasted
  again. That is why `GET /api/version` lists `features` and the copy page refuses
  to say "everything works" while a feature is missing; bump `rev` and extend
  `features` whenever the message shapes change, and tell the owner to re-paste.
  `docs/worker.js` is only the copy Pages serves next to the copy page, never a
  live deploy.
- The Worker can also be deployed from a sandbox with a Cloudflare API token
  (Account → Workers Scripts: Edit), which avoids the owner's manual paste. It is
  an ES module, so the PUT must send `metadata.main_module` and the part as
  `type=application/javascript+module`, or Cloudflare rejects it with
  "Unexpected token 'export'". The bot token is not a dashboard secret in this
  setup - it sits in `DEFAULT_TOKEN` inside the live script - so read the live
  script first and carry that value into the new one before uploading, otherwise
  notifications stop. Verify with `/api/version` (expect the new `rev`).

## Permanent hosting: GitHub Pages (decided 2026-09-25)

- The site is permanently hosted on GitHub Pages, source `main` / `/docs`, at
  https://grigoriy131112-sketch.github.io/deeprealm-site/. It survives sandbox
  death and needs no sign-in step from the owner.
- `docs/` is generated: run `npm run build-pages` after changing anything in
  `public/` or `data/`, then commit. Pages serves `docs/404.html` for unknown
  URLs, which is why the bare "404 page not found" text is gone.
- `docs/` also holds hand-added files that live nowhere else (the `/void` game and
  `docs/img`). The build must only remove the files it owns; the old
  `fs.rmSync(docs, { recursive: true })` deleted the owner's assets on every
  rebuild. `test/build-pages.test.js` runs the real build and pins this.
- A local commit changes nothing for the owner until it is pushed: Pages only
  deploys what is on `main`. After committing, `git push origin main`, then wait
  for `GET /repos/:owner/:repo/pages/builds/latest` to report `built` before
  saying a change is live. The owner has twice reported "nothing changed" while
  the fix was only in the sandbox.
- `origin` carries an embedded token that goes stale and makes `git push` hang on
  a password prompt. Push with the fresh secret instead, never interactively:
  `GIT_TERMINAL_PROMPT=0 git push https://x-access-token:$GITHUB_TOKEN@github.com/... main`,
  and refresh the stored URL with `git remote set-url origin` when it expires.
- The sandbox preview links (`work-*.prod-runtime.all-hands.dev`) are NOT the
  site. They return 502 the moment the sandbox sleeps. Never send them to the
  owner; always give the Pages URL above.
- The chats run in two places: the server owns the AI key and publishing; the
  browser bundle (`docs/chat-browser.js`, built by `scripts/build-chat-browser.js`)
  runs the same rules against a keyless endpoint when no server answers. A static
  host replying to `/api` with its own 404 page counts as "no server here".
- The chats read the knowledge file in its stored shape, so the build publishes
  `docs/data/knowledge.raw.json` next to the reshaped `knowledge.json`. Both are
  needed: the page renders from the reshaped one, the chats answer from the raw
  one.
- The public fallback endpoint rejects a `system` role with a 502, so
  `flattenSystem` folds the rules into a user message. It is also unreliable
  (seen returning `ENOSPC`); it is a stopgap, not a substitute for `LLM_API_KEY`.

## Owner notifications without exposing the bot (2026-09-27)

- The site is served from `docs/` by GitHub Pages, which is static: it cannot hold
  the bot token and must not, because `docs/` is a public repository folder. The
  earlier "token in `docs/data/telegram.json`" design was therefore unsafe and was
  replaced.
- The safe design: the page posts to the owner's server at `POST /api/notify`,
  which relays to Telegram. `data/telegram.json` (and its `docs/` copy) carries
  only `relay.url` + `relay.key`. The key is useless without the server, so the
  bot stays private. `scripts/set-relay.js <server-url>` writes that file and
  verifies the link by sending a real notification.
- `/api/notify` reads `RELAY_KEY` **per request** and answers 401 when it is unset
  or wrong: a deploy without the variable must never become an open relay. It
  carries CORS (`*`) plus a 30/min per-IP brake, because the Pages origin is not
  the server origin. Tests in `test/server.test.js` pin all three cases.
- Secrets live only in `.env` (gitignored) / host env vars:
  `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_CHAT_IDS`, `RELAY_KEY`.
  `scripts/setup-telegram.js` writes them to `.env`, never to a tracked file.
- NOTE: `deeprealm-site.onrender.com` currently answers 404 on every path, so no
  server is live in production. Until a server is deployed with `RELAY_KEY`, the
  Pages site has no owner notifications, and the chats work only in the browser.
  The sandbox cannot keep a server running, so this needs the owner's host.

## Interview loops and story sheets (fixed 2026-09-26)

- Three separate bugs made the interviewers loop forever, all in `chat-core.js`
  and `ai-engine.js`. Do not undo these without re-reading why:
  - `\b` is defined on `[A-Za-z0-9_]`, so a Cyrillic `\b–∏–º—è\b` never matches at
    the right place. Field markers in `hasFieldText` use lookarounds
    (`(?<![–∞-—è—ë])`) instead.
  - `lastAskedField` scans back to the most recent assistant message that names
    a field in ¬´guillemets¬ª. Looking only at the last message restarted the walk
    once the closing ¬´—Å–∫–∞–∂–∏ –ø—Ä–æ–≤–µ—Ä—å¬ª nudge appeared.
  - `staffAnswerPairs` counts the candidate next message as an answer. A pure
    clarifying question must not advance the walk (`answeredStaffPairs` drops it,
    but `hasAnswerContent` keeps "–î–∞, —Å–º–æ–≥—É. –ê –∫–∞–∫ —á–∞—Å—Ç–æ?" as progress), and two
    clarifications on the same question are enough to move on.
- The character walk ends instead of repeating: when nothing is left after the
  field just answered, `nextFieldPrompt` returns the closing nudge.
- A plot is recognised both from intent and from the GM template headings
  (`STORY_INTENT` in `ai-engine.js` mirrors `STORY_MARKERS` in `publish.js`).
- A race and a class have their own checklists (`INTERVIEW_FIELDS.race/class`).
  The walk starts on the very turn the player asks for it: the old code answered
  "describe the race" and then fell through to the character template, so a race
  or a class could never be created. `RACE_INTENT`/`CLASS_INTENT` are matched with
  `[–∞-—è—ë]*`, never `\w*`, because `\w` is ASCII-only in JavaScript and the Cyrillic
  verb ending was never matched.
- The checklist is remembered in the draft as `_kind`. `answerInterview` stamps it
  (`{ ...appState, _kind: kind }`) and returns it; `interviewKind` lets an explicit
  request in the newest message win over the stored kind, so a player can switch
  mid-interview. `_kind` is stripped from the shown draft (`renderApplication`) and
  from the owner's sheet text (`sheetText`), and used as the `detectSheetKind`
  fallback so a thin race/class sheet is still filed under the right heading.
- Cooldowns are measured in turns: `class_balance_rules` in `data/knowledge.json`
  says so, and `INTERVIEWER_SYSTEM` rule 11/12 tells the model to collect a
  per-ability cooldown in turns and never to send the player off to a template.
- An approved sheet of any kind is forwarded to the owner, never published by the
  site. `publish.js` only detects the kind (`detectSheetKind`), and
  `answerInterview` returns no `published` field. `detectSheetKind` must be wired
  via `setSheetDetector` in any test that approves a sheet.
- `telegram.js` accepts several recipients: `TELEGRAM_CHAT_IDS` next to the
  primary `TELEGRAM_CHAT_ID`. `scripts/setup-telegram.js` reads the id from the
  bot's own `getUpdates` (so @userinfobot is not needed) and writes the token and
  ids into `.env`, never into a tracked file. `scripts/set-relay.js` then points
  the public site at the server.
- The suite must not touch the network: with `NODE_ENV=test` the live-speech and
  free-endpoint layers are not wired, because the public endpoint is up on one run
  and down on the next, which made `source` flip between `live` and `local`.

## GitHub write access: use the right app (2026-09-27)

- Writes failed for many rounds with `403 Resource not accessible by integration`
  while `permissions.push` on the repo read `true`. The cause was never the repo:
  it was the app.
- `openhands-dev` ("OpenHands Dev", owner `hieptl`, external_url
  `http://localhost:3001`) is somebody's local test app. GitHub shows
  "This App does not require access to your repositories" for it and there is no
  switch to turn on. Installing it can never grant write access.
- The real one is **`openhands-ai`** ("OpenHands AI", owner `All-Hands-AI`,
  external_url `https://app.all-hands.dev`) with `contents: write`,
  `pull_requests: write`, `workflows: write`. Install link:
  `https://github.com/apps/openhands-ai/installations/new`, pick "Only select
  repositories" and tick `deeprealm-site`.
- After that install, write access starts working immediately on the existing
  token - no new conversation needed. Confirm with a throwaway PUT to
  `/repos/{owner}/{repo}/contents/<file>` and expect 201 (then delete it); a
  `403 Resource not accessible by integration` means the wrong app is installed.
- Install tokens expire after 8 hours, so a push failing later may just be expiry.
- `scripts/setup-telegram.js` writes to `.env` (gitignored), never to
  `data/telegram.json`: that file is public and a bot token there is a leak.
- The relay config in `data/telegram.json` (and its `docs/` twin) is public and
  is set with `node scripts/set-relay.js <url>`; the URL and key must match the
  host's `RELAY_KEY`. Both copies have to agree or the static site silently
  stops notifying.
- The keep-awake pinger must live in `.github/workflows/`, not `deploy/`: GitHub
  runs nothing outside that directory, so the `deploy/` copy is inert, while the
  token lacks `workflows` scope for the REST API. The address is hardcoded in the
  file with a `vars.SITE_URL ||` override, because the app token also cannot
  create repository variables (403).
- Owner's live config: bot `@deeprealbot`, chat id `845121175`, server
  `https://deeprealm-site.onrender.com` (Render, Docker, needs `TELEGRAM_BOT_TOKEN`,
  `TELEGRAM_CHAT_ID`, `RELAY_KEY`).
- The free rewrite endpoint (`text.pollinations.ai/openai`) answers in **10-25
  seconds**. Any timeout under that silently drops the live voice and leaves the
  engine's dry knowledge-base text. That was the "chat sounds like a manual" bug:
  the browser live layer waited 9s, so `liveMessages` never won. The chats now
  take an `onLive` callback: the engine's answer is rendered at once and the
  model's own wording (free call first, live rewrite second) replaces that
  message when it lands. Keep the timeout at 30s for that path.
- Adding a new background rewrite means: return `livePending: true`, pass
  `onLive` into `askModelOrLocal`, and let the caller attach it to the last
  rendered assistant message. The patch must carry the closing word itself -
  `withEnd` in the caller only decorates what it returns first.
- `public/app.js` is the source, `public/chat-browser.js` is generated by
  `scripts/build-chat-browser.js`, and `docs/` is generated by
  `scripts/build-pages.js`. Run both before pushing or the live site keeps the old
  bundle.
- The AI roles are named **Регистратор** (player sheets) and **Регистратор по
  кандидатам** (staff). The site does not judge sheets: `проверь` / `check` accepts
  a ready sheet and hands it to the owner, who decides. Never reintroduce an
  "ОДОБРЕНО" verdict on the player path or a silent reply — both were the "он
  сначала думает, а теперь вообще ничего" bug.
- The first-visit Telegram-handle gate (`#nickGate`) is deliberately unskippable:
  no close button, no backdrop click, no Escape. The handle is stored in
  `localStorage` under `dr_nick`, travels in `/api/visit` and the chat payloads, and
  is shown in owner notifications.
- `scripts/publish-telegraph.js` publishes the Russian game article to telegra.ph.
  The account token (`.telegraph-token`) and page path (`.telegraph-page`) are
  gitignored; the script edits the same page on later runs.

## RP dice bot (bot/, added 2026-10-04)

- A second, independent Telegram bot (**@koobboobbot**) that only rolls dice for
  the role-play. It is not the owner-notification bot (`@deeprealbot`); they share
  no code path.
- Flow: a player registers **in a private chat** with `/reg Имя [@юзер]` plus the
  fourteen ratings, and in the **game group** ends a post with `/roll`. The bot
  answers in the group with three d20 rolls - crit, block, dodge - each with
  **half of the matching characteristic added, rounded down** (Strength 8 -> +4,
  Reaction 5 -> +2). `bot/stats.js` `bonus()` is the only place that halving
  happens.
- **Up to two characters per account** (owner's rule, `bot/characters.js`). A
  second `/reg` fills the next free slot; a third is refused, never overwritten.
  `/del 1`, `/del 2` or `/delall` (also `/del all`) removes one or both; a later character keeps
  its own slot number, so a `/roll 2` the player learned does not silently move.
  `normalizeRecord()` lifts a **pre-multi-character sheet** (`{name, stats}`) into
  slot 1 unchanged, so the old store keeps working with no migration step. The
  store record is now `{ characters: [{ slot, name, stats, user }] }`; the name
  line may carry `@handle`, kept with the character.
- **The player names which character a roll is for** by the number after the
  command: `/roll 1` or `/roll 2`, and a battle post ends on `/roll 1|2`. Without
  a number the bot uses **slot 1**. The bot never guesses the character - the
  number is the only signal, and `/roll N` for a slot that does not exist says
  which slots do. `bot/parse.js` `rollSlot()`/`commandArgs()` read it.
- **Only the player rolls.** The bot rolls for a player's character, never for an
  NPC, an enemy or the world; it only answers a `/roll` the player wrote
  (`COMBAT.playerRolls`). `/rules` and the menu both say so.
- An attack **always lands**; the dice decide only crit, block and dodge. Crit is a
  natural **19-20** (damage x2); block is **18+ full / 12-17 partial**; a natural 1
  on the crit roll is the fumble. A post may add `если крит — <действие>`, which the
  bot echoes only when the crit roll lands (`bot/parse.js` `extractConditional`).
- The rules and the 8-10 feats live **inside the bot** as data: `bot/rules/combat.js`
  and `bot/rules/feats.js`. `/rules` prints the same object the dice read, so the
  spoken rules and the rolled rules cannot drift. Turn economy: 1 full + 3 partial
  actions, movement up to 2 cells per partial slot. Mana is a resource, not a
  characteristic: **skipping an attack** (a post with no attack) restores 5
  (`COMBAT.mana`, printed by `/rules` as "Пропуск атаки восстанавливает 5 маны").
- **Battle-post rules** are their own menu section (`COMBAT.post`, printed by
  `/post` and the `menu:post` button): one `/roll` per turn, the character number
  after the command, the crit conditional. It is separate from the combat rules
  because the owner asked for "правила написания поста в бою" as its own point.
- **The menu** (`bot/menu.js`) is four sections - battle rules, battle-post rules,
  stat feats, and the dice/commands - reached by `/menu`, `/start`, `/rules`,
  `/post` or `/feats`. It is an inline keyboard; each button carries
  `menu:<section>` and **edits the same message in place** (`editMessageText`), so
  the chat is not flooded. Telegram only delivers button presses if
  `callback_query` is in the webhook's `allowed_updates` (the deploy script sets
  it); a callback also needs `answerCallbackQuery` or the button spins forever.
  `worker.js` reports `edits`/`editResults` the same way it reports
  `replies`/`results`, so a webhook test can tell an edit landed.
- Run it with `npm run bot`. The token goes in `TELEGRAM_RP_BOT_TOKEN` (repo `.env`,
  gitignored) - never in code. Sheets are stored at `bot/data/players.json`
  (gitignored), keyed by Telegram id.
- **Live host: a Cloudflare Worker** (`deploy/cloudflare/rp-bot/`), not Render. A
  webhook worker is always on and free; a Render instance would sleep and drop
  updates. Telegram POSTs each update to
  `https://deeprealm-rp-bot.grigoriy131112.workers.dev/`; the worker bundles the
  same `bot/bot.js` core (via `esbuild`, `npm run build:rp-bot`) and swaps the
  store for KV (`kv-store.js`, namespace `deeprealm-rp-bot-players`,
  `e5b0b5d3492640c9a0e6b0ca259e595e`). Redeploy with
  `node scripts/deploy-rp-bot.mjs` (needs `CLOUDFLARE_API_TOKEN`,
  `CLOUDFLARE_ACCOUNT_ID`, `TELEGRAM_RP_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`,
  `RP_KV_ID`). The worker rejects any POST whose
  `X-Telegram-Bot-Api-Secret-Token` header does not match.
- **Group privacy**: the bot must have privacy mode **off** in @BotFather
  (`/setprivacy` -> Disable), otherwise it never sees a group post ending in
  `/roll`. `can_read_all_group_messages: false` in `getMe` means it is still on.
  This is a manual @BotFather step and cannot be set from the API.
- The site server (`server.js`) can also run the bot on the same process when
  `TELEGRAM_RP_BOT_TOKEN` is set (set `RP_BOT=off` to keep it off) - useful if the
  site is already always-on. Only one of the Worker webhook and the long-poll loop
  may run at a time, or the two will fight over updates; `getWebhookInfo` /
  `deleteWebhook` switch between them.
- **The bot must be a member of the game group** (`t.me/Deeprealm5`,
  `-1004302256948`) or it never receives group updates. `getChatMember` returning
  `status: "left"` is the tell; add `@koobboobbot` to the group to fix it. Also,
  that group is a **forum** (`is_forum: true`), so a reply must carry the
  `message_thread_id` of the post it answers, or it lands in the wrong topic.
- **Never fire `send()` without awaiting it.** `bot/bot.js`'s `reply()` is async
  on purpose: a Worker that returns from `fetch` while `sendMessage` is still in
  flight has that request cancelled by the runtime, so the player sees nothing and
  the bot looks dead. `worker.js` reports each send's outcome in its JSON reply
  (`replies`/`results`) precisely so a webhook test can tell "answered" from
  "silently dropped"; check that field before concluding a webhook works.
