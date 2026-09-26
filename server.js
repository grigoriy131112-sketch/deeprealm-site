import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncPlayerContent, defaultSources } from './blog-sync.js';
import { createArticleStore } from './article-store.js';
import { detectSheetKind, buildArticle } from './publish.js';
import { knowledgeView } from './knowledge-view.js';
import { createGithubPublisher } from './github-publish.js';
import { createApiPublisher } from './github-publish-api.js';
import { hydrateArticles } from './article-hydrate.js';
import {
  buildKnowledgeContext, buildStaffContext, staffTurn, stripMarkdown, matchActivityFaq,
  finaleText, isEndCommand, approvedWithSheet, withEnd, handoffText,
  GUIDE_SYSTEM, INTERVIEWER_SYSTEM, STAFF_SYSTEM, setKnowledge, setSheetDetector
} from './chat-core.js';
import { answerGuide, answerInterview, answerStaff, setModelCaller, setFreeModelCaller, setLiveCaller, needsModel } from './chat-answers.js';
import { setEngineArticles } from './ai-engine.js';
import { createLiveSpeaker } from './ai-maker.js';
import { createNotifier, telegramConfig } from './telegram.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_PATH = path.join(__dirname, 'data', 'knowledge.json');

// Minimal .env loader (optional), so the AI key can live outside the code.
const envFile = path.join(__dirname, '.env');
if (process.env.NODE_ENV !== 'test' && fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
}

let knowledge = JSON.parse(fs.readFileSync(KNOWLEDGE_PATH, 'utf8'));
const reloadKnowledge = () => {
  knowledge = JSON.parse(fs.readFileSync(KNOWLEDGE_PATH, 'utf8'));
  setKnowledge(knowledge);
};
setKnowledge(knowledge);
setSheetDetector(detectSheetKind);

// Articles live beside the knowledge file. The path stays overridable so tests can
// point at a temporary copy instead of the real data.
const ARTICLES_PATH = process.env.ARTICLES_PATH || path.join(__dirname, 'data', 'articles.json');
const articleStore = createArticleStore(ARTICLES_PATH, {
  seedPath: process.env.ARTICLES_SEED || path.join(__dirname, 'data', 'articles.json')
});
// The built-in AI answers questions about races and classes too, so it reads the
// article store as well as the knowledge base.
setEngineArticles(articleStore.all());

const PORT = process.env.PORT || 3000;

// The bot token is a secret, so it is normally set in the host's environment. A
// checked-in file is also accepted, which is what makes the static build work:
// the browser reads the same file over HTTPS. It ships with empty values, so
// nothing is exposed until the owner fills it in.
const TELEGRAM_FILE = path.join(__dirname, 'data', 'telegram.json');
function readTelegramFile() {
  try {
    if (!fs.existsSync(TELEGRAM_FILE)) return null;
    return JSON.parse(fs.readFileSync(TELEGRAM_FILE, 'utf8'));
  } catch (err) {
    console.warn(`[telegram] could not read data/telegram.json: ${err.message}`);
    return null;
  }
}

// Approved sheets are written to disk immediately, but the published site is
// served from the repository, so the same article is also pushed there. Without
// this step an approved race or class would only exist on the server that
// happened to handle the request.
//
// Two transports exist because the environments differ. In the deployed
// container there is no git binary and no `.git`, so the article is sent through
// the GitHub Contents API. In a working checkout, git is used so the change also
// lands in the local tree.
const sitePublisher = process.env.GITHUB_REPO
  ? createApiPublisher({
      root: __dirname,
      repo: process.env.GITHUB_REPO,
      token: process.env.GITHUB_TOKEN || '',
      branch: process.env.SITE_BRANCH || 'main',
      enabled: process.env.SITE_AUTOPUBLISH !== 'off',
      log: (m) => console.log(`[site] ${m}`)
    })
  : createGithubPublisher({
      // The checkout that is committed and pushed. Overridable so a test can
      // point at a throwaway repository instead of the real project.
      root: process.env.SITE_REPO_ROOT || __dirname,
      token: process.env.GITHUB_TOKEN || '',
      branch: process.env.SITE_BRANCH || 'main',
      // Off in tests: the suite must never commit to a real repository. A test
      // that needs publishing on sets SITE_AUTOPUBLISH=on explicitly.
      enabled: process.env.SITE_AUTOPUBLISH
        ? process.env.SITE_AUTOPUBLISH !== 'off'
        : process.env.NODE_ENV !== 'test',
      log: (m) => console.log(`[site] ${m}`)
    });
const LLM_API_KEY = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY || process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || '';
const LLM_BASE_URL = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';
const LLM_FALLBACK_MODELS = (process.env.LLM_FALLBACK_MODELS || '')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/knowledge', (req, res) => {
  res.json(knowledgeView(knowledge));
});

// The chat rules read the knowledge file in its stored shape, so the browser needs
// the same shape when it answers on its own. The reshaped payload above is for
// rendering; this one is for the chats.
app.get('/api/knowledge-raw', (req, res) => {
  res.json(knowledge);
});

// Article list for the site: metadata only, so the index page stays light.
app.get('/api/articles', (req, res) => {
  const kind = req.query.kind;
  let list = articleStore.list();
  if (kind) list = list.filter((a) => a.kind === kind);
  res.json({ count: list.length, articles: list });
});

app.get('/api/articles/:slug', (req, res) => {
  const article = articleStore.get(req.params.slug);
  if (!article) return res.status(404).json({ error: 'not_found' });
  res.json(article);
});

// Publishes an approved race or class sheet as a site article. Returns null when the
// sheet is not a race/class, or when the write fails - the player still gets the
// hand-off either way, so a review is never lost because of a publishing error.
async function publishFromSheet({ messages, lang, application }) {
  const kind = detectSheetKind(messages, application);
  // A plot is the game master's material, not a wiki entry: it is forwarded to the
  // owner and stops there, so it never shows up in the races or classes lists.
  if (!kind || kind === 'story') return null;
  const article = await buildArticle({ kind, messages, lang, knowledge, callLLM });
  if (!article) return null;
  const entry = articleStore.publish({ title: article.title, kind, text: article.text });
  // The permanent site reads from the repository, so the new article is also
  // committed and pushed. A failure here is reported but never blocks the
  // player's reply: the sheet itself was already approved.
  const synced = await sitePublisher.sync({
    message: `Publish ${kind} "${entry.title}" from an approved sheet`
  });
  if (!synced.ok && synced.reason !== 'already_published') {
    console.warn(`[site] article "${entry.title}" not pushed: ${synced.reason}${synced.detail ? ` (${synced.detail})` : ''}`);
  }
  return { slug: entry.slug, title: entry.title, kind: entry.kind, synced: synced.ok };
}

async function callLLM(messages, options = {}) {
  const models = [LLM_MODEL, ...LLM_FALLBACK_MODELS];
  let lastError;
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await callModel(model, messages, options);
      } catch (err) {
        lastError = err;
        const transient = /\b(404|429|500|503)\b/.test(err.message);
        if (!transient) throw err;
        // 404 means the model is gone: move on to the next one immediately.
        if (/\b404\b/.test(err.message)) break;
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

async function callModel(model, messages, options = {}) {
  const response = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LLM_API_KEY}`
    },
    body: JSON.stringify({ model, messages, temperature: options.temperature ?? 0.6 })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM error ${response.status}: ${text.slice(0, 300)}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
}

// The shared chat handlers stay environment-agnostic; the model call is the one
// piece they cannot own, so it is handed to them here.
setModelCaller((messages, options) => callLLM(messages, options));

// A keyless public endpoint, used only as a wording upgrade for the free-form
// Guide chat and only when no paid key is configured. It is deliberately optional:
// it is often down, so every failure falls through to the built-in engine, which
// always answers. This is why the owner never has to renew a key.
const FREE_BASE_URL = process.env.FREE_LLM_BASE_URL || 'https://text.pollinations.ai/openai';
const FREE_MODEL = process.env.FREE_LLM_MODEL || 'openai-fast';
// The endpoint is flaky, so a failure opens a breaker for a few minutes. Without
// it every question would pay the full timeout again while the built-in answer
// waits behind it, which users would feel as the chat hanging.
let freeDownUntil = 0;
const FREE_COOLDOWN_MS = 5 * 60 * 1000;

async function callFreeModel(messages, options = {}) {
  if (Date.now() < freeDownUntil) throw new Error('free LLM is in cooldown');
  // The public endpoint rejects a "system" role with a 502 but accepts the same
  // text as a user message, so the rules are folded into the first user turn.
  const rules = messages.filter((m) => m.role === 'system').map((m) => String(m.content || ''));
  const rest = messages.filter((m) => m.role !== 'system');
  const payload = rules.length
    ? [{ role: 'user', content: rules.join('\n\n') }, ...rest]
    : rest;

  const controller = new AbortController();
  // A dead endpoint must not delay the built-in answer waiting behind it.
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(FREE_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: FREE_MODEL, messages: payload, temperature: options.temperature ?? 0.6 }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`free LLM error ${response.status}`);
    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content ?? '';
    if (!String(reply).trim()) throw new Error('free LLM returned an empty reply');
    return reply;
  } catch (err) {
    freeDownUntil = Date.now() + FREE_COOLDOWN_MS;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

setFreeModelCaller((messages, options) => callFreeModel(messages, options));

// The live-speech layer and the owner notifier. Both are optional: with no bot
// token the notifications report `skipped`, and with a dead free endpoint the
// engine's own wording stands. Neither can break a chat.
const notifier = createNotifier({
  config: telegramConfig(process.env, readTelegramFile()),
  log: (m) => console.log(`[telegram] ${m}`)
});
if (!notifier.enabled) console.log('[telegram] уведомления выключены: нет TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID');

const liveSpeaker = createLiveSpeaker({
  env: process.env,
  baseUrl: process.env.LIVE_LLM_BASE_URL,
  model: process.env.LIVE_LLM_MODEL,
  log: (m) => console.log(`[live] ${m}`)
});
if (liveSpeaker) setLiveCaller((messages, options) => liveSpeaker(messages, options));

app.get('/api/status', (req, res) => {
  // The chats are always available: the built-in engine needs no key. `mode`
  // reports whether a model key upgrades the wording; `builtin` is the floor.
  res.json({
    configured: true,
    builtin: true,
    live: Boolean(liveSpeaker),
    telegram: notifier.enabled,
    mode: LLM_API_KEY ? 'model' : 'live'
  });
});

// A visit ping from the page. The owner asked to hear about every arrival, so the
// page reports one and the notifier throttles it per browser session. It always
// answers 200: a notification is never worth an error on the visitor's screen.
app.post('/api/visit', (req, res) => {
  const { page, from, device, session } = req.body || {};
  notifier.visit({ page, from, device, session }).catch(() => {});
  res.json({ ok: true, telegram: notifier.enabled });
});

// The same visit ping, sent by the static site instead of the owner's browser.
// GitHub Pages cannot run this server, so the page posts to a relay the owner
// controls; nothing secret is exposed by accepting the ping.
app.post('/api/notify', (req, res) => {
  const { type } = req.body || {};
  const body = req.body || {};
  const work = type === 'staff' ? notifier.staff(body) : type === 'visit' ? notifier.visit(body) : notifier.sheet(body);
  work.catch(() => {});
  res.json({ ok: true, telegram: notifier.enabled });
});

// Always-available join link, so the site can show it without waiting for AI.
app.get('/api/chat-link', (req, res) => {
  res.json({ chat: knowledge.chat.telegram, owner: knowledge.chat.owner, contact: knowledge.chat.contact || '' });
});

// Pull new player-made races/classes from the blog.
async function runBlogSync() {
  try {
    const result = await syncPlayerContent(KNOWLEDGE_PATH, defaultSources(KNOWLEDGE_PATH));
    if (result.changed) reloadKnowledge();
    if (result.errors.length) console.warn('blog sync:', result.errors.join(' | '));
    return result;
  } catch (err) {
    console.warn('blog sync failed:', err.message);
    return { changed: false, racesAdded: [], classesAdded: [], errors: [err.message] };
  }
}

// A tiny health endpoint. The uptime pinger that keeps a free host awake hits
// this instead of the app shell, so the check stays cheap.
app.get('/healthz', (req, res) => {
  res.json({ ok: true, articles: articleStore.list().length, llm: Boolean(LLM_API_KEY), builtin: true });
});

app.post('/api/refresh', async (req, res) => {
  res.json(await runBlogSync());
});

app.post('/api/guide', async (req, res) => {
  const { messages = [], lang = 'ru' } = req.body || {};
  try {
    res.json(await answerGuide({ messages, lang }));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post('/api/interview', async (req, res) => {
  const { messages = [], lang = 'ru', application = {} } = req.body || {};
  try {
    res.json(await answerInterview({
      messages, lang, application,
      publish: publishFromSheet,
      notify: (info) => notifier.sheet(info)
    }));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post('/api/staff', async (req, res) => {
  const { messages = [], lang = 'ru', application = {} } = req.body || {};
  try {
    res.json(await answerStaff({ messages, lang, application, notify: (info) => notifier.staff(info) }));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Unknown API routes must answer in JSON. Express would otherwise return an HTML
// error page, and the frontend would fail while parsing it as JSON.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'not_found', path: req.path });
});

// The frontend routes by hash (#staff), but links may arrive without the hash.
// Serve the app shell for unknown paths so deep links do not 404.
app.get(/^(?!\/api\/).*/, (req, res, next) => {
  if (path.extname(req.path)) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// A missing file (an old image or article link) falls back to the themed page
// instead of Express's plain "Cannot GET" text.
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Deeprealm site running on http://localhost:${PORT}`);
    console.log('ИИ-чаты работают без ключа: встроенный движок отвечает всегда, а ключ лишь улучшает формулировки.');
  });

  // The container starts from the image, which cannot contain articles approved
  // after the deploy. Reading the repository back restores them, so a restart
  // never loses a player race or class.
  if (process.env.GITHUB_REPO) {
    hydrateArticles({
      repo: process.env.GITHUB_REPO,
      token: process.env.GITHUB_TOKEN || '',
      branch: process.env.SITE_BRANCH || 'main',
      store: articleStore,
      log: (m) => console.log(`[articles] ${m}`)
    }).then((r) => { if (!r.ok) console.warn(`[articles] hydrate skipped: ${r.reason || r.detail || ''}`); });
  }

  // Keep player-made races/classes in sync with the blog; the site only reads the local cache.
  const SYNC_MINUTES = Number(process.env.BLOG_SYNC_MINUTES || 60);
  if (SYNC_MINUTES > 0) {
    runBlogSync();
    setInterval(runBlogSync, SYNC_MINUTES * 60 * 1000).unref();
  }
}

export {
  app, isLLMConfigured, buildKnowledgeContext, buildStaffContext, staffTurn, stripMarkdown,
  matchActivityFaq, finaleText, isEndCommand, approvedWithSheet, withEnd
};
function isLLMConfigured() {
  return Boolean(LLM_API_KEY);
}
