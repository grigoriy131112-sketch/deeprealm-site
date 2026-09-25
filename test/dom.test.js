// Frontend behaviour tests for public/app.js: chat persistence, multiple
// conversations and message actions. A DOM is required, so jsdom is a dev
// dependency; the site itself has no runtime dependency on it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const HTML = fs.readFileSync(path.join(ROOT, '..', 'public', 'index.html'), 'utf8');
const APP_JS = fs.readFileSync(path.join(ROOT, '..', 'public', 'app.js'), 'utf8');
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
async function boot(state = {}) {
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
  window.fetch = async (url, opts = {}) => {
    if (String(url).includes('/api/knowledge')) return { ok: true, status: 200, json: async () => PAYLOAD };
    const body = JSON.parse(opts.body || '{}');
    return { ok: true, status: 200, json: async () => ({ reply: 'echo: ' + body.messages.at(-1).content, application: body.application || {} }) };
  };
  window.confirm = () => true;
  window.scrollTo = () => {};
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
