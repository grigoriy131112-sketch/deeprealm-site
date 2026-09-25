// Frontend behaviour tests for public/app.js: chat persistence, multiple
// conversations and message actions. A DOM is required, so jsdom is a dev
// dependency; the site itself has no runtime dependency on it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { knowledgeView } from '../knowledge-view.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const HTML = fs.readFileSync(path.join(ROOT, '..', 'public', 'index.html'), 'utf8');
const APP_JS = fs.readFileSync(path.join(ROOT, '..', 'public', 'app.js'), 'utf8');
const CHAT_BROWSER_JS = fs.readFileSync(path.join(ROOT, '..', 'public', 'chat-browser.js'), 'utf8');
const KNOWLEDGE = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'data', 'knowledge.json'), 'utf8'));

const PAYLOAD = {
  chat: KNOWLEDGE.chat,
  rules: KNOWLEDGE.rules,
  lore: KNOWLEDGE.lore,
  races: {
    list: KNOWLEDGE.races.list, links: KNOWLEDGE.races.links || {},
    relations: KNOWLEDGE.races.relations, rules: KNOWLEDGE.races.race_template_rules,
    fields: KNOWLEDGE.races.race_template_fields, playerRaces: []
  },
  classes: { ...KNOWLEDGE.classes, playerClasses: [] },
  characterTemplate: KNOWLEDGE.character_template,
  storyTemplate: KNOWLEDGE.story_template,
  entryProcess: KNOWLEDGE.entry_process,
  administration: KNOWLEDGE.administration
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Boot the real app in a DOM. `state` carries localStorage between "reloads".
// `opts.fetch` overrides the stub fetch, so tests can simulate server failures.
async function boot(state = {}, opts = {}) {
  const dom = new JSDOM(HTML, { url: 'https://example.test/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k) => (k in state ? state[k] : null),
      setItem: (k, v) => { state[k] = String(v); },
      removeItem: (k) => { delete state[k]; },
      clear: () => { for (const k of Object.keys(state)) delete state[k]; }
    }
  });
  window.fetch = opts.fetch || (async (url, opts2 = {}) => {
    if (String(url).includes('/api/knowledge-raw')) return { ok: true, status: 200, json: async () => KNOWLEDGE };
      if (String(url).includes('/api/knowledge')) return { ok: true, status: 200, json: async () => PAYLOAD };
    const body = JSON.parse(opts2.body || '{}');
    return { ok: true, status: 200, json: async () => ({ reply: 'echo: ' + body.messages.at(-1).content, application: body.application || {} }) };
  });
  window.confirm = () => true;
  window.scrollTo = () => {};
  // jsdom does not implement scrolling; real browsers do, so it is stubbed here
  // rather than guarded in the app.
  window.Element.prototype.scrollIntoView = () => {};
  // The real page loads the chat bundle before app.js; the tests must do the same,
  // otherwise the browser fallback would look missing. `opts.noChatBundle` simulates
  // a page that somehow shipped without it, which is the only case left where the
  // visitor has to be told that nothing can answer.
  if (!opts.noChatBundle) window.eval(CHAT_BROWSER_JS);
  window.eval(APP_JS);
  await sleep(30);
  return window;
}

const stored = (win) => JSON.parse(win.localStorage.getItem('dr_chats_v1'));

async function send(win, who) {
  const input = win.document.getElementById(`${who}Input`);
  input.value = 'сообщение';
  win.document.getElementById(`${who}Form`).dispatchEvent(new win.Event('submit', { cancelable: true, bubbles: true }));
  await sleep(40);
}

test('first visit with empty storage boots without crashing', async () => {
  const win = await boot({});
  assert.equal(win.document.querySelectorAll('#guideLog .msg').length, 1, 'the guide chat rendered its welcome');
  // Nothing is persisted until the user actually writes, which keeps storage clean.
  assert.equal(win.localStorage.getItem('dr_chats_v1'), null);
  await send(win, 'guide');
  assert.equal(stored(win).guide.convos.length, 1, 'one default conversation is created');
});

test('chat history survives a reload', async () => {
  const state = {};
  let win = await boot(state);
  await send(win, 'guide');

  win = await boot(state);
  const messages = win.document.querySelectorAll('#guideLog .msg');
  assert.equal(messages.length, 3, 'welcome plus the stored exchange');
  assert.match(win.document.getElementById('guideLog').textContent, /сообщение/);
});

test('messages are stored per assistant and do not leak between chats', async () => {
  const state = {};
  const win = await boot(state);
  await send(win, 'staff');
  const data = stored(win);
  assert.equal(data.staff.convos[0].messages.length, 2, 'staff exchange stored');
  assert.equal(data.guide.convos[0].messages.length, 0, 'guide stays empty');
  assert.equal(data.interview.convos[0].messages.length, 0, 'interviewer stays empty');
});

test('a second chat can be created and switched back', async () => {
  const state = {};
  const win = await boot(state);
  await send(win, 'guide');
  const toolbar = win.document.getElementById('guideToolbar');
  [...toolbar.querySelectorAll('button')].find((b) => /Новый чат/.test(b.textContent)).click();
  await sleep(20);

  const data = stored(win);
  assert.equal(data.guide.convos.length, 2, 'two conversations exist');
  assert.equal(data.guide.convos[0].messages.length, 2, 'the first chat is untouched');

  const select = win.document.getElementById('guideToolbar').querySelector('select');
  assert.equal(select.options.length, 2);
  select.value = data.guide.convos[0].id;
  select.dispatchEvent(new win.Event('change', { bubbles: true }));
  await sleep(20);
  assert.match(win.document.getElementById('guideLog').textContent, /сообщение/);
});

test('a message can be edited and deleted', async () => {
  const state = {};
  const win = await boot(state);
  await send(win, 'guide');

  const msg = win.document.querySelector('#guideLog .msg.user');
  const actions = [...msg.querySelectorAll('.msg-action')];
  assert.deepEqual(actions.map((b) => b.title), ['Копировать', 'Изменить', 'Удалить']);

  actions[1].click();
  await sleep(10);
  const editor = msg.querySelector('.msg-editor textarea');
  editor.value = 'исправлено';
  [...msg.querySelectorAll('.msg-editor-bar button')].find((b) => b.textContent === 'Сохранить').click();
  await sleep(20);
  assert.ok(stored(win).guide.convos[0].messages.some((m) => m.content === 'исправлено'), 'edit persisted');

  const again = win.document.querySelector('#guideLog .msg.user');
  [...again.querySelectorAll('.msg-action')].find((b) => b.title === 'Удалить').click();
  await sleep(20);
  assert.equal(stored(win).guide.convos[0].messages.filter((m) => m.role === 'user').length, 0, 'delete persisted');
});

test('the GM plot template is rendered for the interviewer', async () => {
  const win = await boot({});
  const box = win.document.getElementById('storyTemplateBox');
  assert.match(box.textContent, /Шаблон заявки на сюжет для ГМ/);
  assert.match(box.textContent, /Свобода игроков/);
});

// The background scene must never break the page. jsdom has no canvas 2D
// context, which is exactly the hostile case: the scene has to bail out
// quietly and leave the site fully usable.
test('the site still works when canvas 2D is unavailable', async () => {
  const state = {};
  const win = await boot(state);
  const scene = fs.readFileSync(path.join(ROOT, '..', 'public', 'scene.js'), 'utf8');

  // jsdom's getContext returns null, same as an unsupported browser.
  win.eval(scene);

  assert.ok(win.document.querySelector('.page.active'), 'a page is still shown');
  assert.ok(win.document.querySelectorAll('nav.tabs button').length > 5, 'navigation still built');

  await send(win, 'guide');
  assert.ok(win.document.querySelector('#guideLog .msg'), 'chat still works without the scene');
});

test('a failing canvas does not take the page down', async () => {
  const state = {};
  const win = await boot(state);
  const scene = fs.readFileSync(path.join(ROOT, '..', 'public', 'scene.js'), 'utf8');

  const canvas = win.document.getElementById('scene');
  canvas.getContext = () => { throw new Error('boom'); };

  let threw = false;
  try {
    win.eval(scene);
  } catch (err) {
    threw = true;
  }
  // The scene may swallow the failure or let it escape; what must never happen
  // is the page being left broken afterwards.
  assert.ok(win.document.querySelector('.page.active'), 'page intact (threw=' + threw + ')');
  assert.ok(win.document.querySelectorAll('nav.tabs button').length > 5, 'navigation intact');
});

// The reported bug: in the AI chats a sent message vanished. Root cause was
// that an unconfigured AI (503) made the app delete the user's message, so the
// conversation looked like nothing had been sent.
//
// The page normally answers this itself through the bundled rules, so the missing
// bundle is what is simulated here: it is the only state left in which nothing can
// answer and the visitor must be told why.
test('a sent message stays visible when nothing can answer', async () => {
  const state = {};
  const offline = {
    noChatBundle: true,
    fetch: async (url) => {
      if (String(url).includes('/api/knowledge-raw')) return { ok: true, status: 200, json: async () => KNOWLEDGE };
      if (String(url).includes('/api/knowledge')) return { ok: true, status: 200, json: async () => PAYLOAD };
      return { ok: false, status: 503, json: async () => ({ error: 'not_configured' }) };
    }
  };
  const win = await boot(state, offline);

  for (const who of ['guide', 'interview', 'staff']) {
    const input = win.document.getElementById(`${who}Input`);
    input.value = 'привет';
    win.document.getElementById(`${who}Form`).dispatchEvent(new win.Event('submit', { cancelable: true, bubbles: true }));
    await sleep(40);
  }

  for (const who of ['guide', 'interview', 'staff']) {
    const log = win.document.getElementById(`${who}Log`);
    assert.match(log.textContent, /привет/, `${who}: the sent message must remain visible`);
    assert.match(log.textContent, /ИИ ещё не подключён|not connected/i, `${who}: the reason must be explained`);
  }

  // And it must survive a reload, not just the current render.
  const reloaded = await boot(state, offline);
  for (const who of ['guide', 'interview', 'staff']) {
    assert.match(reloaded.document.getElementById(`${who}Log`).textContent, /привет/, `${who}: message persisted`);
  }
});

// The whole point of shipping the rules to the browser: with no server at all the
// chat still answers, so a sleeping host is invisible to a visitor.
test('with no server the chat answers in the browser', async () => {
  const win = await boot({}, { fetch: browserOnlyFetch() });
  await send(win, 'guide');

  const log = win.document.getElementById('guideLog');
  assert.ok(!/Failed to fetch/.test(log.textContent), 'a network error must not leak into the chat');
  assert.match(log.textContent, /конец/, 'the reply must keep the closing word');
  assert.ok(!/ИИ ещё не подключён/.test(log.textContent), 'the chat must not claim the AI is missing');
});

test('a server error keeps the message and reports the failure', async () => {
  const state = {};
  const win = await boot(state, {
    fetch: async (url) => {
      if (String(url).includes('/api/knowledge-raw')) return { ok: true, status: 200, json: async () => KNOWLEDGE };
      if (String(url).includes('/api/knowledge')) return { ok: true, status: 200, json: async () => PAYLOAD };
      return { ok: false, status: 502, json: async () => ({ error: 'upstream exploded' }) };
    }
  });

  const input = win.document.getElementById('guideInput');
  input.value = 'важный вопрос';
  win.document.getElementById('guideForm').dispatchEvent(new win.Event('submit', { cancelable: true, bubbles: true }));
  await sleep(40);

  const log = win.document.getElementById('guideLog');
  assert.match(log.textContent, /важный вопрос/, 'message must not be deleted on error');
  assert.match(log.textContent, /upstream exploded/, 'the server error must be shown');
});

// A visitor could not tell that the AI simply had no key, so the page now says so up
// front. That notice is only correct when nothing can answer at all - with the bundle
// present the browser covers a missing server, so the notice must stay hidden.
test('the AI notice appears only when nothing can answer', async () => {
  const unconfigured = await boot({}, {
    noChatBundle: true,
    fetch: async (url) => {
      if (String(url).includes('/api/knowledge-raw')) return { ok: true, status: 200, json: async () => KNOWLEDGE };
      if (String(url).includes('/api/knowledge')) return { ok: true, status: 200, json: async () => PAYLOAD };
      if (String(url).includes('/api/status')) return { ok: true, status: 200, json: async () => ({ configured: false }) };
      return { ok: false, status: 503, json: async () => ({ error: 'not_configured' }) };
    }
  });
  const box = unconfigured.document.getElementById('aiNotice');
  assert.equal(box.hidden, false, 'notice must be visible when nothing can answer');
  assert.match(box.textContent, /ИИ ещё не подключён/, 'notice must explain the reason');

  // With the bundled rules loaded, a static host still has a working chat, so the
  // notice would be wrong and must not be shown.
  const covered = await boot({}, { fetch: staticFetch() });
  await sleep(40);
  assert.equal(covered.document.getElementById('aiNotice').hidden, true, 'the browser covers a missing server');
});

test('the AI notice stays hidden when the server has a key', async () => {
  const configured = await boot({}, {
    fetch: async (url) => {
      if (String(url).includes('/api/knowledge-raw')) return { ok: true, status: 200, json: async () => KNOWLEDGE };
      if (String(url).includes('/api/knowledge')) return { ok: true, status: 200, json: async () => PAYLOAD };
      if (String(url).includes('/api/status')) return { ok: true, status: 200, json: async () => ({ configured: true }) };
      return { ok: true, status: 200, json: async () => ({ reply: 'ok' }) };
    }
  });
  assert.equal(configured.document.getElementById('aiNotice').hidden, true, 'notice hidden when configured');
});

// GitHub Pages cannot run a server, so /api answers nothing at all. The site is
// published with its data beside the page and must load from there, otherwise
// the permanent link would show an empty site.
const ARTICLES = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'data', 'articles.json'), 'utf8'));

function staticFetch() {
  // The build reshapes the knowledge file before publishing it, so the test
  // serves the same shaped payload the real docs/data/knowledge.json holds.
  const shaped = knowledgeView(KNOWLEDGE);
  return async (url) => {
    const u = String(url);
    if (u.includes('/api/')) throw new TypeError('Failed to fetch');
    if (u.includes('data/articles.json')) return { ok: true, status: 200, json: async () => ARTICLES };
    if (u.includes('data/knowledge.raw.json')) return { ok: true, status: 200, json: async () => KNOWLEDGE };
    if (u.includes('data/knowledge.json')) return { ok: true, status: 200, json: async () => shaped };
    // A static host answers a missing file with the site's own 404 page.
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

// No server of ours and no static host: the site itself comes from memory, so the
// only reachable endpoint is the public one the browser bundle calls. This is the
// sleeping-sandbox case that used to leave the chat dead.
function browserOnlyFetch() {
  const shaped = knowledgeView(KNOWLEDGE);
  return async (url) => {
    const u = String(url);
    if (u.includes('pollinations.ai')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'Здравствуй, путник.' } }] })
      };
    }
    if (u.includes('/api/')) throw new TypeError('Failed to fetch');
    if (u.includes('data/articles.json')) return { ok: true, status: 200, json: async () => ARTICLES };
    if (u.includes('data/knowledge.raw.json')) return { ok: true, status: 200, json: async () => KNOWLEDGE };
    if (u.includes('data/knowledge.json')) return { ok: true, status: 200, json: async () => shaped };
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

test('on static hosting the site loads from the bundled JSON, not from /api', async () => {
  const win = await boot({}, { fetch: staticFetch() });
  await sleep(60);

  const rows = win.document.querySelectorAll('#articleList .article-row');
  assert.equal(rows.length, ARTICLES.articles.length, 'every article must be listed');
  assert.ok(win.document.querySelector('.page.active'), 'a page is shown');
  // No server, but the bundled rules answer, so the chats are not "off".
  assert.equal(win.document.getElementById('aiNotice').hidden, true, 'the chats are usable without a server');
});

test('an article opens on static hosting using the bundled text', async () => {
  const win = await boot({}, { fetch: staticFetch() });
  await sleep(60);

  const first = win.document.querySelector('#articleList .article-row');
  const slug = first.dataset.slug;
  first.click();
  await sleep(40);

  const view = win.document.getElementById('articleView');
  const expected = ARTICLES.articles.find((a) => a.slug === slug);
  assert.equal(view.hidden, false, 'the article view must open');
  assert.match(view.querySelector('h3').textContent, new RegExp(expected.title.slice(0, 12)));
  assert.ok(view.querySelectorAll('.article-body p').length > 0, 'the body must be rendered from the file');
});

