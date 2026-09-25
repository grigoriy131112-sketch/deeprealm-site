const I18N = {
  ru: {
    brand: 'Deeprealm',
    tagline: 'Тёмное фэнтези-РП · мир после Единого Королевства',
    tabs: { home: 'Главная', lore: 'Лор', rules: 'Правила', races: 'Расы', classes: 'Классы', articles: 'Статьи', levelpass: 'Пасс уровней', admin: 'Администрация', application: 'Анкетолог', guide: 'Проводник' },
    'articles.title': 'Статьи',
    'articles.hint': 'Все статьи мира: расы, классы, лор и правила. Новые расы и классы, одобренные анкетологом, появляются здесь автоматически.',
    'articles.search': 'Поиск по статьям…',
    'articles.all': 'Все',
    'articles.race': 'Расы',
    'articles.class': 'Классы',
    'articles.other': 'Прочее',
    'articles.empty': 'Ничего не найдено.',
    'articles.count': 'Статей: {n}',
    'articles.back': '← Назад к списку',
    'articles.open': 'Открыть статью',
    'home.title': 'Добро пожаловать в Deeprealm',
    'home.lead': 'Мир, переживший гибель Спасителя, раскол Единого Королевства и Грохот. Здесь игроки создают персонажей, расы и классы, а ГМ ведёт их через мрак и свет.',
    'home.create': 'Создать персонажа',
    'home.ask': 'Спросить Проводника',
    'home.howTitle': 'Как вступить',
    'home.chatHint': 'Постоянная ссылка на чат — по ней можно перейти в любой момент:',
    'home.owner': 'Ты можешь написать владельцу {owner} или подать заявку в чат {chat} — отвечаем всем, кто готов играть.',
    'home.adminLink': 'Состав администрации и их роли',
    'lore.title': 'Лор мира',
    'rules.title': 'Правила чата',
    'rules.hint': 'Нажмите на раздел, чтобы раскрыть пункты.',
    'races.title': 'Расы',
    'races.relations': 'Отношения рас',
    'races.rules': 'Правила создания своей расы',
    'races.template': 'Поля анкеты расы',
    'races.playerBlog': 'Все расы игроков в блоге',
    'races.player': 'Расы игроков',
    'races.templateLink': 'Шаблон своей расы',
    'classes.title': 'Классы',
    'classes.base': 'Базовые классы',
    'classes.specs': 'Специализации',
    'classes.player': 'Классы игроков',
    'classes.balance': 'Правила баланса классов',
    'classes.levelPass': 'Пасс уровней',
    'classes.levelPassLink': 'Как работает пасс уровней',
    'lp.title': 'Пасс уровней',
    'lp.hint': 'Награда выдаётся сразу при переходе на новый уровень — за прошлые уровни её получить нельзя.',
    'lp.tier': 'Этап',
    'admin.title': 'Администрация',
    'admin.hint': 'Команда проекта, направления и как попасть в неё.',
    'admin.levels': 'Ступени роста',
    'admin.roles': 'Направления',
    'admin.practice': 'Практикант',
    'admin.main': 'Основная степень',
    'admin.chief': 'Главный',
    'admin.general': 'Общие правила команды',
    'admin.questions': 'Что спросят',
    'admin.pace': 'Обычная активность',
    'admin.faq': 'Частые вопросы кандидатов',
    'staff.title': 'Анкетолог по кандидатам',
    'staff.hint': 'Хочешь в команду? Расскажи, куда хочешь, и ответь на вопросы. Заявку посмотрит владелец.',
    staffWelcome: 'Привет. Я Анкетолог по кандидатам в администрацию Deeprealm. Скажи, в какое направление хочешь: зам владельца, пиарщик, модератор, разработчик, гейм-мастер, анкетолог или ивентолог. Если не определился — расскажу про каждое и помогу выбрать.',
    chipsStaff: ['Хочу в модераторы', 'Хочу в гейм-мастера', 'Хочу в пиарщики', 'Расскажи про направления', 'Сколько нужно активить?', 'Добавь в заявку', 'Проверь мою заявку'],
    'classes.templateLink': 'Шаблон своего класса',
    'classes.playerBlog': 'Все классы игроков в блоге',
    'player.empty': 'Пока нет — список пополняется.',
    'classes.basicAttack': 'Базовая атака',
    'classes.abilities': 'Способности',
    'app.title': 'ИИ-анкетолог',
    'app.hint': 'Опиши персонажа свободно. Скажи «добавь в анкету», чтобы сохранить детали. После проверки анкетолог выдаст ссылку на чат.',
    'guide.title': 'Проводник',
    'guide.hint': 'Чат-справочник: вопросы о правилах, лоре, расах, классах и вступлении. Без ролевой игры.',
    'chat.send': 'Отправить',
    'chat.placeholderInterview': 'Расскажи о своём персонаже…',
    'chat.placeholderGuide': 'Задай вопрос о чате…',
    'chat.placeholderStaff': 'Куда хочешь вступить?',
    'chat.thinking': 'Проводник думает…',
    'chat.thinkingApp': 'Анкетолог думает…',
    'chat.notConfigured': '⚠️ ИИ ещё не подключён. Добавьте ключ в файл .env, чтобы Проводник и Анкетолог заработали.',
    'chat.error': 'Не удалось получить ответ от ИИ.',
    'chat.copy': 'Копировать',
    'chat.edit': 'Изменить',
    'chat.delete': 'Удалить',
    'chat.save': 'Сохранить',
    'chat.cancel': 'Отмена',
    'chat.new': 'Новый чат',
    'chat.deleteChat': 'Удалить чат',
    'chat.confirmDeleteChat': 'Удалить этот чат? Действие необратимо.',
    'chat.empty': 'Пустой чат',
    'chat.end': 'Конец',
    'chat.endTitle': 'Завершить диалог',
    'chat.endCommand': 'конец',
    guideWelcome: 'Привет, путник. Я Проводник Deeprealm. Спрошу тебя о правилах, лоре, расах, классах — или подскажу, как вступить в чат.',
    appWelcome: 'Привет. Я Анкетолог Deeprealm. Расскажи о своём персонаже: имя, раса, класс, характер, сильные и слабые стороны. Когда захочешь добавить что-то в анкету — напиши «добавь в анкету». Когда закончим — я проверю всё и дам ссылку на чат.',
    chipsGuide: ['Как вступить в чат?', 'Какие есть расы?', 'Какие есть классы?', 'Расскажи про Воина', 'Что такое пасс уровней?', 'Кто в администрации?', 'Что такое Подземелье?', 'Правила про метагейм?'],
    chipsApp: ['Хочу создать персонажа', 'Хочу создать свою расу', 'Хочу создать свой класс', 'Хочу предложить сюжет', 'Добавь в анкету', 'Покажи анкету', 'Проверь мою заявку']
  },
  en: {
    brand: 'Deeprealm',
    tagline: 'Dark fantasy RP · a world after the Single Kingdom',
    tabs: { home: 'Home', lore: 'Lore', rules: 'Rules', races: 'Races', classes: 'Classes', articles: 'Articles', levelpass: 'Level pass', admin: 'Administration', application: 'Interviewer', guide: 'Guide' },
    'articles.title': 'Articles',
    'articles.hint': 'Every article of the world: races, classes, lore and rules. New races and classes approved by the interviewer appear here automatically.',
    'articles.search': 'Search articles…',
    'articles.all': 'All',
    'articles.race': 'Races',
    'articles.class': 'Classes',
    'articles.other': 'Other',
    'articles.empty': 'Nothing found.',
    'articles.count': 'Articles: {n}',
    'articles.back': '← Back to the list',
    'articles.open': 'Open article',
    'home.title': 'Welcome to Deeprealm',
    'home.lead': 'A world that survived the death of the Savior, the fall of the Single Kingdom and the Rumble. Players create characters, races and classes while the GM leads them through shadow and light.',
    'home.create': 'Create a character',
    'home.ask': 'Ask the Guide',
    'home.howTitle': 'How to join',
    'home.chatHint': 'A permanent chat link you can follow at any time:',
    'home.owner': 'You can message the owner {owner} or apply in the chat {chat} — we answer everyone who is ready to play.',
    'home.adminLink': 'The administration team and their roles',
    'lore.title': 'World lore',
    'rules.title': 'Chat rules',
    'rules.hint': 'Click a section to expand its points.',
    'races.title': 'Races',
    'races.relations': 'Relations between races',
    'races.rules': 'Rules for creating your own race',
    'races.template': 'Race application fields',
    'races.playerBlog': 'All player races in the blog',
    'races.player': 'Player-made races',
    'races.templateLink': 'Custom race template',
    'classes.title': 'Classes',
    'classes.base': 'Base classes',
    'classes.specs': 'Specializations',
    'classes.player': 'Player-made classes',
    'classes.balance': 'Class balance rules',
    'classes.levelPass': 'Level pass',
    'classes.levelPassLink': 'How the level pass works',
    'lp.title': 'Level pass',
    'lp.hint': 'A reward is granted the moment you reach a new level — you cannot get it for past levels.',
    'lp.tier': 'Tier',
    'admin.title': 'Administration',
    'admin.hint': 'The project team, its branches, and how to join.',
    'admin.levels': 'Ranks',
    'admin.roles': 'Branches',
    'admin.practice': 'Trainee',
    'admin.main': 'Full rank',
    'admin.chief': 'Lead',
    'admin.general': 'General team rules',
    'admin.questions': 'What they ask',
    'admin.pace': 'Typical activity',
    'admin.faq': 'Questions candidates ask',
    'staff.title': 'Staff application interviewer',
    'staff.hint': 'Want to join the team? Say which branch and answer the questions. The owner reviews your application.',
    staffWelcome: 'Hi. I am the Deeprealm staff application interviewer. Tell me which branch you want: deputy owner, PR, moderator, developer, game master, application reviewer or event manager. If you are unsure I will walk you through each and help you choose.',
    chipsStaff: ['I want to be a moderator', 'I want to be a game master', 'I want to do PR', 'Tell me about the branches', 'How much activity is expected?', 'Add to the application', 'Review my application'],
    'classes.templateLink': 'Custom class template',
    'classes.playerBlog': 'All player classes in the blog',
    'player.empty': 'None yet — the list grows over time.',
    'classes.basicAttack': 'Basic attack',
    'classes.abilities': 'Abilities',
    'app.title': 'AI Interviewer',
    'app.hint': 'Describe your character freely. Say "add to the application" to save details. After review the interviewer grants the chat link.',
    'guide.title': 'Guide',
    'guide.hint': 'A reference chat: questions about the rules, lore, races, classes and joining. No roleplay.',
    'chat.send': 'Send',
    'chat.placeholderInterview': 'Tell me about your character…',
    'chat.placeholderGuide': 'Ask something about the chat…',
    'chat.placeholderStaff': 'Which branch do you want?',
    'chat.thinking': 'The Guide is thinking…',
    'chat.thinkingApp': 'The Interviewer is thinking…',
    'chat.notConfigured': '⚠️ AI is not connected yet. Add a key to the .env file to enable the Guide and the Interviewer.',
    'chat.error': 'Could not get a reply from the AI.',
    'chat.copy': 'Copy',
    'chat.edit': 'Edit',
    'chat.delete': 'Delete',
    'chat.save': 'Save',
    'chat.cancel': 'Cancel',
    'chat.new': 'New chat',
    'chat.deleteChat': 'Delete chat',
    'chat.confirmDeleteChat': 'Delete this chat? This cannot be undone.',
    'chat.empty': 'Empty chat',
    'chat.end': 'Finish',
    'chat.endTitle': 'Finish the conversation',
    'chat.endCommand': 'finish',
    guideWelcome: 'Greetings, traveler. I am the Deeprealm Guide. Ask me about the rules, lore, races or classes — or how to join the chat.',
    appWelcome: 'Hi. I am the Deeprealm Interviewer. Tell me about your character: name, race, class, personality, strengths and weaknesses. Say "add to the application" to save details. When we are done I will review everything and grant the chat link.',
    chipsGuide: ['How do I join?', 'What races are there?', 'What classes are there?', 'Tell me about the Warrior', 'What is the level pass?', 'Who is in the administration?', 'What is the Dungeon?', 'Rules on metagaming?'],
    chipsApp: ['I want to create a character', 'I want to create a race', 'I want to create a class', 'I want to propose a plot', 'Add to the application', 'Show the application', 'Review my application']
  }
};

const state = {
  lang: localStorage.getItem('dr_lang') || 'ru',
  knowledge: null,
  articles: [],
  articleFilter: 'all',
  articleQuery: ''
};

function renderArticles() {
  const filters = [
    ['all', t('articles.all')],
    ['race', t('articles.race')],
    ['class', t('articles.class')],
    ['other', t('articles.other')]
  ];
  el('articleFilters').innerHTML = filters
    .map(([key, label]) => `<button class="chip${state.articleFilter === key ? ' active' : ''}" data-filter="${key}">${esc(label)}</button>`)
    .join('');
  el('articleFilters').querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => { state.articleFilter = b.dataset.filter; renderArticles(); });
  });

  const q = state.articleQuery.trim().toLowerCase();
  const list = state.articles.filter((a) => {
    if (state.articleFilter === 'race' && a.kind !== 'race') return false;
    if (state.articleFilter === 'class' && a.kind !== 'class') return false;
    if (state.articleFilter === 'other' && ['race', 'class'].includes(a.kind)) return false;
    return !q || a.title.toLowerCase().includes(q);
  });

  const rows = list.map((a) => {
    const tag = a.kind === 'race' ? t('articles.race') : a.kind === 'class' ? t('articles.class') : t('articles.other');
    return `<button class="article-row" type="button" data-slug="${esc(a.slug)}">
      <span class="article-title">${esc(a.title)}</span>
      <span class="tag">${esc(tag)}</span>
    </button>`;
  }).join('');

  el('articleList').innerHTML = list.length
    ? `<p class="hint">${esc(t('articles.count').replace('{n}', String(list.length)))}</p>${rows}`
    : `<p class="hint">${esc(t('articles.empty'))}</p>`;

  el('articleList').querySelectorAll('.article-row').forEach((b) => {
    b.addEventListener('click', () => openArticle(b.dataset.slug));
  });
}

async function openArticle(slug) {
  const view = el('articleView');
  view.hidden = false;
  view.innerHTML = `<p class="hint">…</p>`;
  const res = await fetch(`/api/articles/${encodeURIComponent(slug)}`);
  if (!res.ok) { view.innerHTML = `<p class="hint">${esc(t('articles.empty'))}</p>`; return; }
  const a = await res.json();
  // Text is kept line by line by the blog import, so each line is rendered as its own row.
  const body = String(a.text || '').split('\n').map((line) => (line.trim() ? `<p>${esc(line)}</p>` : '<p class="gap"></p>')).join('');
  const back = String(a.url || '');
  view.innerHTML = `
    <button class="btn" type="button" id="articleBack">${esc(t('articles.back'))}</button>
    <h3>${esc(a.title)}</h3>
    ${back ? `<p><a href="${esc(back)}" target="_blank" rel="noopener">${esc(t('articles.open'))}</a></p>` : ''}
    <div class="article-body">${body}</div>`;
  el('articleBack').addEventListener('click', () => { view.hidden = true; view.innerHTML = ''; });
  view.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadArticles() {
  if (!el('articleList')) return;
  try {
    const res = await fetch('/api/articles');
    const data = await res.json();
    state.articles = Array.isArray(data.articles) ? data.articles : [];
  } catch {
    state.articles = [];
  }
  renderArticles();
}

// ---------- chats: persistence, multiple conversations, message actions ----------

const CHAT_TYPES = ['guide', 'interview', 'staff'];
const STORE_KEY = 'dr_chats_v1';

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function newConvo() { return { id: uid(), messages: [], application: {} }; }

function loadStore() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(STORE_KEY)); } catch { raw = null; }
  const store = {};
  for (const type of CHAT_TYPES) {
    const entry = raw && typeof raw[type] === 'object' && raw[type] ? raw[type] : {};
    let convos = Array.isArray(entry.convos) ? entry.convos : [];
    convos = convos.filter((c) => c && typeof c === 'object' && Array.isArray(c.messages));
    convos.forEach((c) => { if (!c.application) c.application = {}; });
    if (!convos.length) convos = [newConvo()];
    const active = convos.some((c) => c.id === entry.active) ? entry.active : convos[0].id;
    store[type] = { active, convos };
  }
  return store;
}

let chatStore = loadStore();

function saveStore() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(chatStore)); } catch { /* storage full or blocked */ }
}

function bucket(type) { return chatStore[type]; }
function activeConvo(type) {
  const b = bucket(type);
  return b.convos.find((c) => c.id === b.active) || b.convos[0];
}

const el = (id) => document.getElementById(id);
const t = (key) => I18N[state.lang][key] ?? I18N.ru[key] ?? key;

async function boot() {
  const res = await fetch('/api/knowledge');
  state.knowledge = await res.json();
  el('langSelect').value = state.lang;
  renderStatic();
  renderKnowledge();
  buildTabs();
  wireNav();
  wireChats();
  wireLang();
  wireArticles();
  showAiStatus();
  await loadArticles();
  openFromHash();
}

// The AI chats cannot answer without a key, and nothing used to say so: a
// visitor typed, got no reply, and concluded the site was broken.
async function showAiStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data && data.configured) return;
    const box = el('aiNotice');
    box.textContent = t('chat.notConfigured');
    box.hidden = false;
  } catch { /* status is optional; the per-chat message still covers it */ }
}

function renderStatic() {
  document.documentElement.lang = state.lang;
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    const key = node.dataset.i18n;
    const value = key.split('.').reduce((o, k) => (o ? o[k] : undefined), I18N[state.lang]);
    if (value) node.textContent = value;
  });
  el('interviewInput').placeholder = t('chat.placeholderInterview');
  el('guideInput').placeholder = t('chat.placeholderGuide');
  el('staffInput').placeholder = t('chat.placeholderStaff');
  const link = state.knowledge.chat.telegram;
  el('chatLinkHero').textContent = link;
  el('chatLinkHero').href = link;
  el('chatLinkFooter').href = link;
  const admin = state.knowledge.chat.administration;
  if (el('adminLink')) {
    el('adminLink').textContent = t('home.adminLink');
    el('adminLink').href = admin || '#';
    el('adminLink').hidden = !admin;
  }
  const owner = state.knowledge.chat.owner;
  if (el('ownerContact')) {
    el('ownerContact').innerHTML = t('home.owner')
      .replace('{owner}', `<a href="https://t.me/${esc(owner.replace('@', ''))}" target="_blank" rel="noopener">${esc(owner)}</a>`)
      .replace('{chat}', `<a href="${esc(link)}" target="_blank" rel="noopener">${esc(link)}</a>`);
  }
  document.querySelectorAll('[data-i18n-ph]').forEach((node) => {
    const value = t(node.dataset.i18nPh);
    if (value) node.placeholder = value;
  });
}

function buildTabs() {
  const tabs = el('tabs');
  tabs.innerHTML = '';
  Object.entries(I18N[state.lang].tabs).forEach(([page, label]) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.dataset.page = page;
    btn.addEventListener('click', () => showPage(page));
    tabs.appendChild(btn);
  });
}

function showPage(page) {
  document.querySelectorAll('.page').forEach((p) => p.classList.toggle('active', p.dataset.page === page));
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
  location.hash = page;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function wireNav() {
  document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => showPage(b.dataset.goto)));
}

function openFromHash() {
  const page = location.hash.replace('#', '') || 'home';
  if (document.querySelector(`.page[data-page="${page}"]`)) showPage(page);
  else showPage('home');
}

function wireLang() {
  el('langSelect').addEventListener('change', (e) => {
    state.lang = e.target.value;
    localStorage.setItem('dr_lang', state.lang);
    renderStatic();
    buildTabs();
    renderKnowledge();
    renderArticles();
    renderChips();
    renderAllChats();
    showPage(location.hash.replace('#', '') || 'home');
  });
}

// Search runs on every keystroke; the list is local, so no request is needed.
function wireArticles() {
  const search = el('articleSearch');
  if (!search) return;
  search.addEventListener('input', () => { state.articleQuery = search.value; renderArticles(); });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Turn @username / t.me links into clickable Telegram links; plain text otherwise.
function ownerLink(text) {
  const s = String(text || '');
  const user = s.match(/@([A-Za-z0-9_]{4,})/);
  if (user) return `<a href="https://t.me/${user[1]}" target="_blank" rel="noopener">${esc(s)}</a>`;
  const url = s.match(/https?:\/\/[^\s]+/);
  if (url) return `<a href="${esc(url[0])}" target="_blank" rel="noopener">${esc(s)}</a>`;
  return esc(s);
}

function tagOrLink(text, href) {
  if (href) return `<a class="tag" href="${esc(href)}" target="_blank" rel="noopener">${esc(text)}</a>`;
  return `<span class="tag">${esc(text)}</span>`;
}

// Player-made entries come from the blog sync; fall back to any legacy shape in the data.
function playerList(entries, blogLink, blogLabel, fallback = []) {
  const list = (Array.isArray(entries) && entries.length ? entries : fallback) || [];
  if (!list.length) return `<p class="hint">${esc(t('player.empty'))}</p>`;
  const rows = list.map((c) => {
    const name = c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.name)}</a>` : esc(c.name);
    return `<p><strong>${name}</strong> — ${ownerLink(c.author)}</p>`;
  }).join('');
  const all = blogLink ? `<p><a href="${esc(blogLink)}" target="_blank" rel="noopener">${esc(blogLabel)}</a></p>` : '';
  return rows + all;
}

function renderKnowledge() {
  const k = state.knowledge;
  // Home
  const steps = state.lang === 'ru'
    ? ['Придумайте персонажа и, при желании, свою расу и класс.', 'Пройдите диалог с ИИ-анкетологом и проверку.', 'Получите одобрение и ссылку на чат Telegram.']
    : ['Design your character and, optionally, your own race and class.', 'Go through the AI interviewer dialogue and review.', 'Get approval and the Telegram chat link.'];
  el('entrySteps').innerHTML = steps.map((s) => `<li>${esc(s)}</li>`).join('');
  el('homeGrid').innerHTML = [
    [t('races.title'), state.lang === 'ru' ? `${k.races.list.length} + свои` : `${k.races.list.length} + custom`, 'races'],
    [t('classes.title'), state.lang === 'ru' ? `${Object.keys(k.classes.base_classes).length} базовых + свои` : `${Object.keys(k.classes.base_classes).length} base + custom`, 'classes'],
    [t('rules.title'), state.lang === 'ru' ? '7 разделов' : '7 sections', 'rules'],
    [t('guide.title'), 'AI', 'guide']
  ].map(([title, sub, page]) => `
    <div class="card" style="cursor:pointer" data-goto="${page}">
      <h3>${esc(title)}</h3><p class="hint">${esc(sub)}</p>
    </div>`).join('');
  wireNav();

  // Lore
  el('loreContent').innerHTML = Object.entries(k.lore).map(([title, body]) => {
    const inner = typeof body === 'string' ? `<p>${esc(body)}</p>` : Object.entries(body).map(([n, d]) => `<p><strong>${esc(n)}.</strong> ${esc(d)}</p>`).join('');
    return `<div class="card"><h3>${esc(title)}</h3>${inner}</div>`;
  }).join('');

  // Rules
  el('rulesContent').innerHTML = Object.entries(k.rules).map(([section, items]) => `
    <details class="rule-section"><summary>${esc(section)}</summary>
      <ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
    </details>`).join('');

  // Races
  const relationRows = Object.entries(k.races.relations).map(([race, rels]) => `
    <div class="card"><h3>${esc(race)}</h3>
      ${Object.entries(rels).map(([to, txt]) => `<p><strong>${esc(to)}:</strong> ${esc(txt)}</p>`).join('')}
    </div>`).join('');
  const raceLinks = k.races.links || {};
  el('racesContent').innerHTML = `
    <div class="card"><h3>${esc(t('races.title'))}</h3><p>${k.races.list.map((r) => tagOrLink(r, raceLinks[r])).join('')}</p></div>
    <div class="card"><h3>${esc(t('races.rules'))}</h3><ul>${k.races.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>
    <div class="card"><h3>${esc(t('races.template'))}</h3><p>${k.races.fields.map((f) => `<span class="tag">${esc(f)}</span>`).join('')}</p>
      ${k.races.templateLink ? `<p><a href="${esc(k.races.templateLink)}" target="_blank" rel="noopener">${esc(t('races.templateLink'))}</a></p>` : ''}
    </div>
    <div class="card"><h3>${esc(t('races.player'))}</h3>
      ${playerList(k.races.playerRaces, k.races.playerBlogLink, k.races.playerBlogLink ? t('races.playerBlog') : '')}
    </div>
    <h3>${esc(t('races.relations'))}</h3>${relationRows}`;

  // Classes
  const classLinks = k.classes.links || {};
  const lp = k.classes.level_pass || {};
  const levelPassRows = [lp.note ? `<p>${esc(lp.note)}</p>` : '', ...(lp.tiers || []).map((tier) => `
    <p><strong>${esc(tier.name)} (${esc(tier.range)})</strong></p>
    <ul>${tier.rewards.map((r) => `<li>${esc(r.level)} ур. — ${esc(r.reward)}</li>`).join('')}</ul>`)]
    .filter(Boolean).join('');
  el('classesContent').innerHTML = `
    <div class="card"><h3>${esc(t('classes.base'))}</h3>
      ${Object.entries(k.classes.base_classes).map(([name, d]) => `
        <p><strong>${classLinks[name] ? `<a href="${esc(classLinks[name])}" target="_blank" rel="noopener">${esc(name)}</a>` : esc(name)}</strong> — ${esc(d.resource)}. ${esc(d.start)}. ${esc(t('classes.basicAttack'))}: ${esc(d.basic_attack)}. ${esc(t('classes.abilities'))}: ${esc(d.abilities)}. ${esc(d.exhaustion)}</p>`).join('')}
      <p class="hint">${esc(k.classes.class_system)}</p>
    </div>
    <div class="card"><h3>${esc(t('classes.specs'))}</h3>
      ${Object.entries(k.classes.specializations).map(([cls, specs]) => {
        const specLinks = (classLinks.specializations || {})[cls] || {};
        return `<p><strong>${esc(cls)}:</strong> ${specs.map((s) => tagOrLink(s, specLinks[s])).join('')}</p>`;
      }).join('')}
    </div>
    <div class="card"><h3>${esc(t('classes.player'))}</h3>
      ${playerList(k.classes.playerClasses, k.classes.playerBlogLink, k.classes.playerBlogLink ? t('classes.playerBlog') : '', k.classes.player_classes || k.classes.playerClasses)}
    </div>
    <div class="card"><h3>${esc(t('classes.levelPass'))}</h3>
      ${levelPassRows}
      ${k.classes.level_pass_link ? `<p><a href="${esc(k.classes.level_pass_link)}" target="_blank" rel="noopener">${esc(t('classes.levelPassLink'))}</a></p>` : ''}
    </div>
    <div class="card"><h3>${esc(t('classes.balance'))}</h3><ul>${k.classes.class_balance_rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
      ${k.classes.template_link ? `<p><a href="${esc(k.classes.template_link)}" target="_blank" rel="noopener">${esc(t('classes.templateLink'))}</a></p>` : ''}
    </div>`;

  // Level pass (its own page)
  el('levelPassContent').innerHTML = [
    lp.note ? `<div class="card"><p>${esc(lp.note)}</p></div>` : '',
    ...(lp.tiers || []).map((tier) => `
      <div class="card"><h3>${esc(tier.name)} <span class="hint">(${esc(tier.range)})</span></h3>
        <ul>${tier.rewards.map((r) => `<li><strong>${esc(r.level)} ур.</strong> — ${esc(r.reward)}</li>`).join('')}</ul>
      </div>`),
    k.classes.level_pass_link ? `<p><a href="${esc(k.classes.level_pass_link)}" target="_blank" rel="noopener">${esc(t('classes.levelPassLink'))}</a></p>` : ''
  ].filter(Boolean).join('');

  renderAdmin();
  renderChips();
  renderStoryTemplate();
}

// The GM plot template is long, so it stays collapsed until asked for.
function renderStoryTemplate() {
  const box = el('storyTemplateBox');
  if (!box) return;
  const text = state.knowledge && state.knowledge.storyTemplate;
  if (!text) { box.innerHTML = ''; return; }
  const title = state.lang === 'ru' ? 'Шаблон заявки на сюжет для ГМ' : 'GM plot submission template';
  const hint = state.lang === 'ru'
    ? 'Хочешь предложить сюжет? Разверни шаблон или просто напиши «Хочу предложить сюжет» — анкетолог поможет оформить.'
    : 'Want to propose a plot? Expand the template, or just say "I want to propose a plot" and the interviewer will help.';
  box.innerHTML = `
    <details class="rule-section">
      <summary>${esc(title)}</summary>
      <div class="story-template">
        <p class="hint">${esc(hint)}</p>
        <pre>${esc(text)}</pre>
      </div>
    </details>`;
}

function renderAdmin() {
  const a = state.knowledge.administration || {};
  const roles = a.roles || [];
  const roleCards = roles.map((r) => `
    <div class="card"><h3>${esc(r.name)}</h3>
      <p><strong>${esc(t('admin.practice'))}:</strong> ${esc(r.practice)}</p>
      <p><strong>${esc(t('admin.main'))}:</strong> ${esc(r.main)}</p>
      <p><strong>${esc(t('admin.chief'))}:</strong> ${esc(r.chief)}</p>
      ${r.pace ? `<p><strong>${esc(t('admin.pace'))}:</strong> ${esc(r.pace)}</p>` : ''}
      <details class="rule-section"><summary>${esc(t('admin.questions'))}</summary>
        <ul>${(r.questions || []).map((q) => `<li>${esc(q)}</li>`).join('')}</ul>
      </details>
    </div>`).join('');
  const faq = a.activity_faq || [];
  el('adminContent').innerHTML = [
    a.intro ? `<div class="card"><p>${esc(a.intro)}</p></div>` : '',
    (a.levels_note || a.growth) ? `<div class="card"><h3>${esc(t('admin.levels'))}</h3>
      ${a.levels_note ? `<p>${esc(a.levels_note)}</p>` : ''}${a.growth ? `<p>${esc(a.growth)}</p>` : ''}</div>` : '',
    `<div class="card"><h3>${esc(t('admin.roles'))}</h3><p>${roles.map((r) => `<span class="tag">${esc(r.name)}</span>`).join('')}</p></div>`,
    faq.length ? `<div class="card"><h3>${esc(t('admin.faq'))}</h3>
      ${faq.map((f) => `<p><strong>${esc(f.q)}</strong><br>${esc(f.a)}</p>`).join('')}</div>` : '',
    roleCards,
    (a.general || []).length ? `<div class="card"><h3>${esc(t('admin.general'))}</h3><ul>${a.general.map((g) => `<li>${esc(g)}</li>`).join('')}</ul></div>` : '',
    a.apply_intro ? `<div class="card"><p>${esc(a.apply_intro)}</p>${a.apply_hint ? `<p class="hint">${esc(a.apply_hint)}</p>` : ''}</div>` : ''
  ].filter(Boolean).join('');
}

function renderChips() {
  el('guideChips').innerHTML = I18N[state.lang].chipsGuide.map((c) => `<button data-chip="${esc(c)}">${esc(c)}</button>`).join('');
  el('interviewChips').innerHTML = I18N[state.lang].chipsApp.map((c) => `<button data-chip="${esc(c)}">${esc(c)}</button>`).join('');
  el('staffChips').innerHTML = I18N[state.lang].chipsStaff.map((c) => `<button data-chip="${esc(c)}">${esc(c)}</button>`).join('');
  el('guideChips').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => sendGuide(b.dataset.chip)));
  el('interviewChips').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => sendInterview(b.dataset.chip)));
  el('staffChips').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => sendStaff(b.dataset.chip)));
}

const CHAT_UI = {
  guide: { log: 'guideLog', form: 'guideForm', input: 'guideInput', welcome: 'guideWelcome', thinking: 'chat.thinking', toolbar: 'guideToolbar' },
  interview: { log: 'interviewLog', form: 'interviewForm', input: 'interviewInput', welcome: 'appWelcome', thinking: 'chat.thinkingApp', toolbar: 'interviewToolbar' },
  staff: { log: 'staffLog', form: 'staffForm', input: 'staffInput', welcome: 'staffWelcome', thinking: 'chat.thinkingApp', toolbar: 'staffToolbar' }
};

function pushMsg(logId, role, text) {
  const log = el(logId);
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return div;
}

function actionButton(label, title, handler) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'msg-action';
  b.textContent = label;
  b.title = title;
  b.addEventListener('click', handler);
  return b;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

// A stored message, rendered with copy / edit / delete controls.
function messageNode(type, index) {
  const convo = activeConvo(type);
  const msg = convo.messages[index];
  const wrap = document.createElement('div');
  wrap.className = `msg ${msg.role}`;

  const body = document.createElement('div');
  body.className = 'msg-body';
  body.textContent = msg.content;
  wrap.appendChild(body);

  const actions = document.createElement('div');
  actions.className = 'msg-actions';

  actions.appendChild(actionButton('⧉', t('chat.copy'), async (e) => {
    const btn = e.currentTarget;
    const ok = await copyText(msg.content);
    btn.textContent = ok ? '✓' : '✕';
    setTimeout(() => { btn.textContent = '⧉'; }, 1200);
  }));

  actions.appendChild(actionButton('✎', t('chat.edit'), () => startEdit(wrap, body, actions, msg, type)));
  actions.appendChild(actionButton('🗑', t('chat.delete'), () => {
    convo.messages.splice(index, 1);
    saveStore();
    renderChat(type);
  }));

  wrap.appendChild(actions);
  return wrap;
}

function startEdit(wrap, body, actions, msg, type) {
  if (wrap.querySelector('.msg-editor')) return;
  actions.hidden = true;
  body.hidden = true;

  const editor = document.createElement('div');
  editor.className = 'msg-editor';
  const ta = document.createElement('textarea');
  ta.value = msg.content;
  ta.rows = Math.min(8, Math.max(2, msg.content.split('\n').length));
  editor.appendChild(ta);

  const bar = document.createElement('div');
  bar.className = 'msg-editor-bar';
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'msg-action wide';
  save.textContent = t('chat.save');
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'msg-action wide';
  cancel.textContent = t('chat.cancel');
  bar.appendChild(save);
  bar.appendChild(cancel);
  editor.appendChild(bar);

  const finish = (commit) => {
    if (commit) {
      const next = ta.value.trim();
      if (next) msg.content = next;
    }
    saveStore();
    renderChat(type);
  };
  save.addEventListener('click', () => finish(true));
  cancel.addEventListener('click', () => finish(false));

  wrap.appendChild(editor);
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
}

function renderToolbar(type) {
  const bar = el(CHAT_UI[type].toolbar);
  if (!bar) return;
  const b = bucket(type);
  bar.innerHTML = '';

  const select = document.createElement('select');
  select.className = 'convo-select';
  b.convos.forEach((c, i) => {
    const opt = document.createElement('option');
    opt.value = c.id;
    const label = c.messages.length
      ? String((c.messages.find((m) => m.role !== 'system') || c.messages[0]).content).slice(0, 40)
      : t('chat.empty');
    opt.textContent = `${i + 1}. ${label}`;
    opt.selected = c.id === b.active;
    select.appendChild(opt);
  });
  select.addEventListener('change', (e) => {
    b.active = e.target.value;
    saveStore();
    renderChat(type);
  });
  bar.appendChild(select);

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'msg-action wide';
  add.textContent = t('chat.new');
  add.addEventListener('click', () => newChat(type));
  bar.appendChild(add);

  // Lets the visitor end the conversation without knowing the magic word.
  const end = document.createElement('button');
  end.type = 'button';
  end.className = 'msg-action wide';
  end.textContent = t('chat.end');
  end.title = t('chat.endTitle');
  end.addEventListener('click', () => {
    const command = t('chat.endCommand');
    if (type === 'guide') sendGuide(command);
    else if (type === 'interview') sendInterview(command);
    else sendStaff(command);
  });
  bar.appendChild(end);

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'msg-action wide';
  del.textContent = t('chat.deleteChat');
  del.disabled = b.convos.length < 2;
  del.addEventListener('click', () => deleteChat(type));
  bar.appendChild(del);
}

function newChat(type) {
  const b = bucket(type);
  const convo = newConvo();
  b.convos.push(convo);
  b.active = convo.id;
  saveStore();
  renderChat(type);
  el(CHAT_UI[type].input).focus();
}

function deleteChat(type) {
  const b = bucket(type);
  if (b.convos.length < 2) return;
  if (!confirm(t('chat.confirmDeleteChat'))) return;
  const idx = b.convos.findIndex((c) => c.id === b.active);
  b.convos.splice(idx, 1);
  b.active = b.convos[Math.max(0, idx - 1)].id;
  saveStore();
  renderChat(type);
}

function renderChat(type) {
  const ui = CHAT_UI[type];
  const log = el(ui.log);
  log.innerHTML = '';
  if (type === 'guide' || type === 'interview' || type === 'staff') {
    pushMsg(ui.log, 'assistant', t(ui.welcome));
  }
  activeConvo(type).messages.forEach((_, i) => log.appendChild(messageNode(type, i)));
  log.scrollTop = log.scrollHeight;
  renderToolbar(type);
}

function renderAllChats() {
  CHAT_TYPES.forEach(renderChat);
}

function addMessage(type, role, content) {
  const convo = activeConvo(type);
  convo.messages.push({ role, content });
  saveStore();
  el(CHAT_UI[type].log).appendChild(messageNode(type, convo.messages.length - 1));
  const log = el(CHAT_UI[type].log);
  log.scrollTop = log.scrollHeight;
}

function wireChats() {
  renderAllChats();
  el('guideForm').addEventListener('submit', (e) => { e.preventDefault(); sendGuide(el('guideInput').value); });
  el('interviewForm').addEventListener('submit', (e) => { e.preventDefault(); sendInterview(el('interviewInput').value); });
  el('staffForm').addEventListener('submit', (e) => { e.preventDefault(); sendStaff(el('staffInput').value); });
  ['guideInput', 'interviewInput', 'staffInput'].forEach((id) => {
    el(id).addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el(id).form.requestSubmit(); }
    });
  });
}

async function sendGuide(text) {
  text = String(text || '').trim();
  if (!text) return;
  el('guideInput').value = '';
  addMessage('guide', 'user', text);
  const convo = activeConvo('guide');
  const pending = pushMsg('guideLog', 'system', t('chat.thinking'));
  try {
    const res = await fetch('/api/guide', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: convo.messages, lang: state.lang })
    });
    const data = await res.json();
    pending.remove();
    if (res.status === 503 || data.error === 'not_configured') {
      // Keep the typed message: deleting it made the chat look like nothing was
      // sent, which is how the "messages disappear" bug was reported.
      pushMsg('guideLog', 'system', t('chat.notConfigured'));
      return;
    }
    const reply = res.ok ? data.reply : `${t('chat.error')} ${data.error || ''}`;
    addMessage('guide', 'assistant', reply);
  } catch (err) {
    pending.remove();
    pushMsg('guideLog', 'system', 'Error: ' + err.message);
  }
}

async function sendInterview(text) {
  text = String(text || '').trim();
  if (!text) return;
  el('interviewInput').value = '';
  addMessage('interview', 'user', text);
  const convo = activeConvo('interview');
  maybeSaveApplication(text);
  const pending = pushMsg('interviewLog', 'system', t('chat.thinkingApp'));
  try {
    const res = await fetch('/api/interview', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: convo.messages, lang: state.lang, application: convo.application })
    });
    const data = await res.json();
    pending.remove();
    if (res.status === 503 || data.error === 'not_configured') {
      pushMsg('interviewLog', 'system', t('chat.notConfigured'));
      return;
    }
    const reply = res.ok ? data.reply : `${t('chat.error')} ${data.error || ''}`;
    addMessage('interview', 'assistant', reply);
    // A newly approved race or class lands in the article store; refresh the list so
    // it shows up without a page reload.
    if (data.published) await loadArticles();
  } catch (err) {
    pending.remove();
    pushMsg('interviewLog', 'system', 'Error: ' + err.message);
  }
}

// Local mirror of the "add to the application" command, so the draft persists client-side.
function maybeSaveApplication(text) {
  const low = text.toLowerCase();
  const trigger = low.includes('добавь в анкету') || low.includes('add to the application');
  if (!trigger) return;
  const note = text.replace(/добавь в анкету/gi, '').replace(/add to the application/gi, '').trim();
  if (note) { activeConvo('interview').application[`note_${Date.now()}`] = note; saveStore(); }
}

async function sendStaff(text) {
  text = String(text || '').trim();
  if (!text) return;
  el('staffInput').value = '';
  addMessage('staff', 'user', text);
  const convo = activeConvo('staff');
  const low = text.toLowerCase();
  if (low.includes('добавь в заявку') || low.includes('add to the application')) {
    const note = text.replace(/добавь в заявку/gi, '').replace(/add to the application/gi, '').trim();
    if (note) { convo.application[`note_${Date.now()}`] = note; saveStore(); }
  }
  const pending = pushMsg('staffLog', 'system', t('chat.thinkingApp'));
  try {
    const res = await fetch('/api/staff', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: convo.messages, lang: state.lang, application: convo.application })
    });
    const data = await res.json();
    pending.remove();
    if (res.status === 503 || data.error === 'not_configured') {
      pushMsg('staffLog', 'system', t('chat.notConfigured'));
      return;
    }
    const reply = res.ok ? data.reply : `${t('chat.error')} ${data.error || ''}`;
    addMessage('staff', 'assistant', reply);
    if (data && data.application) { convo.application = data.application; saveStore(); }
  } catch (err) {
    pending.remove();
    pushMsg('staffLog', 'system', 'Error: ' + err.message);
  }
}

boot();
