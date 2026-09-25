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

AI endpoints need `LLM_API_KEY` in `.env` (see `.env.example`). Without a key
the AI chats return a "not configured" message; that is expected.

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

## Permanent hosting

`*.prod-runtime.all-hands.dev` links die with their sandbox, which is why a
sandbox error used to make the whole site unreachable. The site is meant to run
on a real host (`render.yaml` + `Dockerfile` are ready for Render; any Docker
host works). Deploy once, then publish updates from any sandbox or chat with
`scripts/sync_from_conversation.py`. Never point users at a sandbox URL.

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
- Verified working Gemini models on the free tier: `gemini-flash-lite-latest`,
  `gemini-3.5-flash-lite`, `gemini-3-flash-preview`. `gemini-3.6-flash` and
  `gemini-3.7-flash` do not exist.
