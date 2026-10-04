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
    fields: KNOWLEDGE.races.race_template_fields,
    playerRaces: KNOWLEDGE.races.player_races || [],
    playerBlogLink: KNOWLEDGE.races.player_blog_link || ''
  },
  classes: {
    ...KNOWLEDGE.classes,
    playerClasses: KNOWLEDGE.classes.player_classes || [],
    playerBlogLink: KNOWLEDGE.classes.player_blog_link || ''
  },
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
  // scene.js needs a 2D canvas, which jsdom does not have, so navigation tests
  // install a stand-in that just records the rooms the page asked for.
  if (opts.scene) {
    const calls = [];
    window.DeeprealmScene = {
      setRoom: (name) => { calls.push(name); },
      getRoom: () => (calls.length ? calls[calls.length - 1] : 'courtyard'),
      rooms: ['courtyard', 'library', 'guild', 'throne'],
      calls
    };
  }
  // The real page loads the chat bundle before app.js; the tests must do the same,
  // otherwise the browser fallback would look missing. `opts.noChatBundle` simulates
  // a page that somehow shipped without it, which is the only case left where the
  // visitor has to be told that nothing can answer.
  // The blog is read with a JSONP <script>; jsdom will not fetch one, so the tag is
  // intercepted and answered from `opts.blog(path)` instead.
  if (opts.blog) {
    const head = window.document.head;
    const origAppend = head.appendChild.bind(head);
    head.appendChild = (node) => {
      if (node && node.tagName === 'SCRIPT' && node.src) {
        const cb = (node.src.match(/callback=([^&]+)/) || [])[1];
        const path = decodeURIComponent((node.src.match(/[?&]path=([^&]+)/) || [])[1] || '');
        setTimeout(() => {
          const feed = opts.blog(path);
          if (feed && cb && typeof window[cb] === 'function') window[cb](feed);
          else if (typeof node.onerror === 'function') node.onerror();
        }, 0);
        return node;
      }
      return origAppend(node);
    };
  }
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
    assert.match(log.textContent, /ИИ-движок|AI engine/i, `${who}: the reason must be explained`);
  }

  // And it must survive a reload, not just the current render.
  const reloaded = await boot(state, offline);
  for (const who of ['guide', 'interview', 'staff']) {
    assert.match(reloaded.document.getElementById(`${who}Log`).textContent, /привет/, `${who}: message persisted`);
  }
});

// The whole point of shipping the rules to the browser: with no server at all the
// chat still answers, so a sleeping host is invisible to a visitor.
// The free model takes ten to twenty-five seconds, so its wording lands on the
// message that is already on screen instead of being awaited and dropped.
test('the live wording replaces the shown answer when it arrives', async () => {
  const shaped = knowledgeView(KNOWLEDGE);
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes('pollinations.ai')) {
      await sleep(80);
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'Привет, путник, я живой ответ.' } }] }) };
    }
    if (u.includes('/api/')) throw new TypeError('Failed to fetch');
    if (u.includes('data/knowledge.raw.json')) return { ok: true, status: 200, json: async () => KNOWLEDGE };
    if (u.includes('data/knowledge.json')) return { ok: true, status: 200, json: async () => shaped };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const win = await boot({}, { fetch: fetchImpl });
  await send(win, 'guide');

  const log = win.document.getElementById('guideLog');
  assert.ok(!/живой ответ/.test(log.textContent), 'the instant answer is shown first');
  await sleep(200);
  assert.match(log.textContent, /живой ответ/, 'the live wording takes its place');
  assert.match(log.textContent, /конец/, 'the replaced text keeps the closing word');
});

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

// The chats answer with no key at all, so the notice can only mean the bundled
// engine itself failed to load. That is only correct when nothing can answer at all -
// with the bundle present the browser covers a missing server, so it must stay hidden.
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
  assert.match(box.textContent, /ИИ-движок|AI engine/i, 'notice must explain the reason');

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
function staticFetch() {
  // The build reshapes the knowledge file before publishing it, so the test
  // serves the same shaped payload the real docs/data/knowledge.json holds.
  const shaped = knowledgeView(KNOWLEDGE);
  return async (url) => {
    const u = String(url);
    if (u.includes('/api/')) throw new TypeError('Failed to fetch');
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
    if (u.includes('data/knowledge.raw.json')) return { ok: true, status: 200, json: async () => KNOWLEDGE };
    if (u.includes('data/knowledge.json')) return { ok: true, status: 200, json: async () => shaped };
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

test('on static hosting the site loads from the bundled JSON, not from /api', async () => {
  const win = await boot({}, { fetch: staticFetch() });
  await sleep(60);

  // The player races and classes come from the blog; without it the snapshot in
  // the bundled knowledge file is what the pages show.
  const races = win.document.querySelectorAll('#racesContent .player-entry, #racesContent .card p');
  assert.ok(races.length > 0, 'the player races must be listed from the snapshot');
  assert.ok(win.document.querySelector('.page.active'), 'a page is shown');
  // No server, but the bundled rules answer, so the chats are not "off".
  assert.equal(win.document.getElementById('aiNotice').hidden, true, 'the chats are usable without a server');
});

// The player races and classes are read from the blog with JSONP, so a race the
// owner publishes shows up on the page with no rebuild and no server.
test('a race published in the blog appears on the Races page', async () => {
  const indexHtml = '1. Расса: <a href="https://deeprealm1.blogspot.com/2026/08/new.html">Новая раса</a><br/>Создатель: @author';
  const postHtml = '<p>Самоназвание: Новая раса</p><p>Особые приметы: светятся в темноте</p>';
  const win = await boot({}, {
    blog: (path) => {
      if (path.includes('new.html')) return { feed: { entry: [{ title: { $t: 'Новая раса' }, content: { $t: postHtml } }] } };
      if (path.includes('blog-post_304')) return { feed: { entry: [{ content: { $t: indexHtml } }] } };
      return { feed: { entry: [{ content: { $t: '' } }] } };
    }
  });
  await sleep(120);

  // Every blog read uses one post per request, which is what keeps it cheap.
  const races = win.document.getElementById('racesContent');
  assert.match(races.textContent, /Новая раса/, 'the freshly published race is listed');
  assert.ok(races.querySelector('.player-entry'), 'and it is folded into a readable card');
  assert.match(races.textContent, /светятся в темноте/, 'its full text came from the post');
});

// The background changes room by room as the visitor walks through the site.
test('each section of the site asks the scene for its room', async () => {
  const win = await boot({}, { scene: true });
  await sleep(40);

  // The section the page opens on is taken directly: no doorway over a page the
  // visitor has not left yet.
  assert.deepEqual(win.DeeprealmScene.calls, ['courtyard'], 'the home page is the courtyard');

  const expected = {
    lore: 'library',
    races: 'guild',
    classes: 'guild',
    levelpass: 'guild',
    rules: 'throne',
    admin: 'throne',
    application: 'throne',
    guide: 'throne',
    home: 'courtyard'
  };
  for (const [page, room] of Object.entries(expected)) {
    const btn = [...win.document.querySelectorAll('#tabs button')].find((b) => b.dataset.page === page);
    assert.ok(btn, 'there is a tab for ' + page);
    btn.click();
    await sleep(1400);
    assert.equal(win.DeeprealmScene.calls.at(-1), room, page + ' must be read in the ' + room);
    assert.equal(win.document.querySelector('.page.active').dataset.page, page);
  }
});

test('a language switch does not re-enter the room or flash the doorway', async () => {
  const win = await boot({}, { scene: true });
  await sleep(40);
  const btn = [...win.document.querySelectorAll('#tabs button')].find((b) => b.dataset.page === 'rules');
  btn.click();
  await sleep(1400);
  const before = win.DeeprealmScene.calls.length;

  const lang = win.document.getElementById('langSelect');
  win.localStorage.setItem('dr_lang', 'en');
  lang.value = 'en';
  lang.dispatchEvent(new win.Event('change'));
  await sleep(60);

  assert.equal(win.DeeprealmScene.calls.length, before, 'staying in the same room must not rebuild or replay the door');
});

test('the doorway overlay covers the room change and is cleaned up afterwards', async () => {
  const win = await boot({}, { scene: true });
  await sleep(40);
  const doorway = win.document.getElementById('doorway');
  assert.ok(doorway, 'the page must carry the doorway element');
  assert.equal(doorway.classList.contains('open'), false, 'the door starts shut and hidden');

  const btn = [...win.document.querySelectorAll('#tabs button')].find((b) => b.dataset.page === 'lore');
  btn.click();
  assert.ok(doorway.classList.contains('open'), 'the leaves close as soon as the walk starts');

  // The swap happens while the screen is covered, then the leaves draw back and
  // the overlay is cleared so it never traps a click or a screen reader.
  await sleep(1300);
  assert.equal(win.DeeprealmScene.calls.at(-1), 'library');
  await sleep(1200);
  assert.equal(doorway.classList.contains('open'), false);
  assert.equal(doorway.classList.contains('parting'), false, 'no class is left behind');
});


// --- owner notifications on the static site ---------------------------------
// GitHub Pages has no server, so approvals are relayed to the owner through the
// bundled notifier. A staff interview must go out as "staff" with its answers: sent
// as "sheet" the relay dropped them and the owner saw only the heading. And it must
// be sent once, not on every later message.

function relayBoot(state = {}) {
  const calls = [];
  const opts = {
    fetch: async (url, o = {}) => {
      const u = String(url);
      if (u.includes('/api/knowledge-raw')) return { ok: true, status: 200, json: async () => KNOWLEDGE };
      if (u.includes('/api/knowledge')) return { ok: true, status: 200, json: async () => PAYLOAD };
      if (u.includes('data/telegram.json')) return { ok: true, status: 200, json: async () => ({ relay: { url: 'https://relay.example.test', key: 'k' } }) };
      if (u.includes('relay.example.test')) { calls.push(JSON.parse(o.body || '{}')); return { ok: true, status: 200, json: async () => ({ ok: true }) }; }
      if (u.startsWith('https://example.test/api')) return { ok: false, status: 404, json: async () => null };
      throw new Error('unreachable: ' + u);
    }
  };
  return { state, opts, calls };
}

async function say(win, who, text) {
  const input = win.document.getElementById(`${who}Input`);
  input.value = text;
  win.document.getElementById(`${who}Form`).dispatchEvent(new win.Event('submit', { cancelable: true, bubbles: true }));
  await sleep(120);
}

test('a staff interview is relayed as staff with its answers, and only once', async () => {
  const { state, opts, calls } = relayBoot();
  const win = await boot(state, opts);
  await say(win, 'staff', 'хочу в гейм-мастера');
  await say(win, 'staff', 'каждый день');
  await say(win, 'staff', 'веду по вечерам');
  await say(win, 'staff', 'опыт есть');
  await sleep(120);

  const staffCalls = calls.filter((c) => c.type === 'staff');
  assert.equal(staffCalls.length, 1, 'the owner gets exactly one staff notification');
  assert.ok(staffCalls[0].answers.length >= 1, 'the answers travel with the notification');
  assert.equal(calls.some((c) => c.type === 'sheet' && c.answers), false, 'a staff interview must not be sent as a sheet');
});

test('an approved sheet is relayed as a sheet with its full text', async () => {
  const { state, opts, calls } = relayBoot();
  const win = await boot(state, opts);
  await say(win, 'interview', 'придумай мне класс сам');
  await say(win, 'interview', 'проверь');
  await sleep(120);

  const sheets = calls.filter((c) => c.type === 'sheet');
  assert.equal(sheets.length, 1, 'the owner gets exactly one sheet');
  assert.match(sheets[0].text, /Название класса:/, 'the full sheet text travels, not just the heading');
});

