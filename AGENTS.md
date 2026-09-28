# AGENTS.md — Deeprealm site

Instructions for any OpenHands chat or sandbox working on this repository.

## What this repo is

The Deeprealm RP-chat website: lore, rules, races, classes, level pass,
administration, the AI Guide (Проводник) and the AI application interviewers.
Node + Express, no build step. Node >= 18.

- `server.js` — Express app and API endpoints (`/api/knowledge`, `/api/chat-link`,
  `/api/guide`, `/api/interview`, `/api/staff`, `/api/refresh`, `/api/status`).
- `public/` — static frontend (`index.html`, `app.js`, `styles.css`).
- `data/knowledge.json` — all site content. Edit this to change lore, rules,
  races, classes, level pass and administration.
- `blog-sync.js` — pulls player-made races/classes from the Deeprealm blog.
- `test/server.test.js` — test suite.

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
`npm test`, then publish. Keep the JSON shape stable — `public/app.js` and
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
  the same for two different posts (`Магистр сфер` and `Администрация`). The old
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
  link, the trailing «конец» and the «ОДОБРЕНО»/«РЕКОМЕНДОВАН» mark, and add no
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
- Notifications cover three things the owner asked for: every site visit
  (`/api/visit`, throttled per browser session), every approved character/race/
  class sheet, and every answer a staff candidate gave (paired question → answer).
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

## Permanent hosting: GitHub Pages (decided 2026-09-25)

- The site is permanently hosted on GitHub Pages, source `main` / `/docs`, at
  https://grigoriy131112-sketch.github.io/deeprealm-site/. It survives sandbox
  death and needs no sign-in step from the owner.
- `docs/` is generated: run `npm run build-pages` after changing anything in
  `public/` or `data/`, then commit. Pages serves `docs/404.html` for unknown
  URLs, which is why the bare "404 page not found" text is gone.
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
  - `\b` is defined on `[A-Za-z0-9_]`, so a Cyrillic `\bимя\b` never matches at
    the right place. Field markers in `hasFieldText` use lookarounds
    (`(?<![а-яё])`) instead.
  - `lastAskedField` scans back to the most recent assistant message that names
    a field in «guillemets». Looking only at the last message restarted the walk
    once the closing «скажи проверь» nudge appeared.
  - `staffAnswerPairs` counts the candidate next message as an answer. A pure
    clarifying question must not advance the walk (`answeredStaffPairs` drops it,
    but `hasAnswerContent` keeps "Да, смогу. А как часто?" as progress), and two
    clarifications on the same question are enough to move on.
- The character walk ends instead of repeating: when nothing is left after the
  field just answered, `nextFieldPrompt` returns the closing nudge.
- A plot is recognised both from intent and from the GM template headings
  (`STORY_INTENT` in `ai-engine.js` mirrors `STORY_MARKERS` in `publish.js`).
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
