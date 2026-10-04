// Мастерская «Логоса»: профиль и свои мысли прямо в браузере.
//
// На GitHub Pages сервера нет, поэтому хранить записи негде — они лежат
// в localStorage. Отсюда и «без регистрации»: профиль не нужно нигде
// заводить, он принадлежит браузеру. Кнопка «Сохранить копию» выгружает
// всё в файл, «Загрузить копию» возвращает записи обратно.
(function () {
  const STORE_KEY = "logos-workshop";
  const root = document.getElementById("workshop");
  if (!root) return;

  const canPublish = root.dataset.canPublish === "true";
  const els = {
    setup: document.getElementById("ws-setup"),
    setupForm: document.getElementById("ws-setup-form"),
    profile: document.getElementById("ws-profile"),
    profileForm: document.getElementById("ws-profile-form"),
    profileEdit: document.getElementById("ws-edit-profile"),
    profileCancel: document.getElementById("ws-profile-cancel"),
    avatar: document.getElementById("ws-avatar"),
    nick: document.getElementById("ws-nick"),
    about: document.getElementById("ws-about"),
    statPosts: document.getElementById("ws-stat-posts"),
    statTags: document.getElementById("ws-stat-tags"),
    statMin: document.getElementById("ws-stat-min"),
    editor: document.getElementById("ws-editor"),
    editorTitle: document.getElementById("ws-editor-title"),
    form: document.getElementById("ws-form"),
    newBtn: document.getElementById("ws-new"),
    cancelBtn: document.getElementById("ws-cancel"),
    list: document.getElementById("ws-list"),
    empty: document.getElementById("ws-empty"),
    count: document.getElementById("ws-thoughts-count"),
    exportBtn: document.getElementById("ws-export"),
    importInput: document.getElementById("ws-import"),
  };

  /* ---------- Хранилище ---------- */

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const data = raw ? JSON.parse(raw) : null;
      if (data && data.profile && Array.isArray(data.thoughts)) return data;
    } catch (e) {
      // Испорченные данные не должны ломать страницу: начинаем заново.
    }
    return { profile: null, thoughts: [] };
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {
      alert("Не удалось сохранить: в браузере закончилось место для данных.");
    }
  }

  let state = load();
  let editingId = null;

  /* ---------- Разметка ---------- */
  // Свои тексты тоже показываем как Markdown, но сначала экранируем HTML:
  // иначе случайная угловая скобка сломает страницу.

  function escapeHtml(text) {
    return (text || "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[ch]));
  }

  function inline(text) {
    return text
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
               '<a href="$2" rel="noopener noreferrer">$1</a>');
  }

  function mdToHtml(source) {
    const lines = escapeHtml(source).split(/\r?\n/);
    const out = [];
    let para = [];
    let list = null;
    let code = null;

    const flushPara = () => {
      if (para.length) {
        out.push("<p>" + inline(para.join(" ")) + "</p>");
        para = [];
      }
    };
    const flushList = () => {
      if (list) {
        out.push("</" + list + ">");
        list = null;
      }
    };

    lines.forEach((line) => {
      if (code !== null) {
        if (/^```/.test(line)) {
          out.push("<pre><code>" + code.join("\n") + "</code></pre>");
          code = null;
        } else {
          code.push(line);
        }
        return;
      }
      if (/^```/.test(line)) {
        flushPara(); flushList();
        code = [];
        return;
      }
      if (!line.trim()) {
        flushPara(); flushList();
        return;
      }
      const heading = line.match(/^(#{1,3})\s+(.*)$/);
      if (heading) {
        flushPara(); flushList();
        const level = heading[1].length + 1; // h1 страницы уже занят заголовком
        out.push(`<h${level}>` + inline(heading[2]) + `</h${level}>`);
        return;
      }
      if (/^>\s?/.test(line)) {
        flushPara(); flushList();
        out.push("<blockquote>" + inline(line.replace(/^>\s?/, "")) + "</blockquote>");
        return;
      }
      const item = line.match(/^\s*[-*]\s+(.*)$/);
      const numbered = line.match(/^\s*\d+\.\s+(.*)$/);
      if (item || numbered) {
        flushPara();
        const kind = item ? "ul" : "ol";
        if (list !== kind) {
          flushList();
          out.push("<" + kind + ">");
          list = kind;
        }
        out.push("<li>" + inline((item || numbered)[1]) + "</li>");
        return;
      }
      flushList();
      para.push(line.trim());
    });

    flushPara(); flushList();
    if (code !== null) out.push("<pre><code>" + code.join("\n") + "</code></pre>");
    return out.join("");
  }

  function readingTime(text) {
    const words = (text || "").trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 180));
  }

  function parseTags(raw) {
    const seen = [];
    (raw || "").replace(/#/g, " ").split(",").forEach((chunk) => {
      const tag = chunk.trim().toLowerCase();
      if (tag && seen.indexOf(tag) === -1) seen.push(tag);
    });
    return seen;
  }

  function ruDate(iso) {
    const months = ["января", "февраля", "марта", "апреля", "мая", "июня",
                    "июля", "августа", "сентября", "октября", "ноября", "декабря"];
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear();
  }

  /* ---------- Показ ---------- */

  function render() {
    const hasProfile = Boolean(state.profile && state.profile.nick);
    els.setup.hidden = hasProfile;
    els.profile.hidden = !hasProfile;
    if (!hasProfile) {
      els.editor.hidden = true;
      els.list.innerHTML = "";
      els.empty.hidden = true;
      els.count.textContent = "";
      return;
    }
    const nick = state.profile.nick;
    els.nick.textContent = nick;
    els.about.textContent = state.profile.about || "Без описания";
    els.avatar.textContent = nick.trim().charAt(0).toUpperCase() || "?";

    const tags = [];
    let minutes = 0;
    state.thoughts.forEach((t) => {
      minutes += readingTime(t.body);
      parseTags(t.tags).forEach((tag) => { if (tags.indexOf(tag) === -1) tags.push(tag); });
    });
    els.statPosts.textContent = state.thoughts.length;
    els.statTags.textContent = tags.length;
    els.statMin.textContent = minutes;
    els.count.textContent = state.thoughts.length
      ? "всего: " + state.thoughts.length
      : "";

    const sorted = state.thoughts.slice().sort((a, b) =>
      (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at));

    els.list.innerHTML = "";
    sorted.forEach((thought) => {
      const li = document.createElement("li");
      li.className = "post-card";

      const head = document.createElement("h3");
      head.textContent = thought.title;
      li.appendChild(head);

      if (thought.summary) {
        const p = document.createElement("p");
        p.className = "post-summary";
        p.textContent = thought.summary;
        li.appendChild(p);
      }

      const meta = document.createElement("div");
      meta.className = "post-meta";
      const when = document.createElement("time");
      when.textContent = ruDate(thought.created_at);
      meta.appendChild(when);
      if (thought.updated_at && thought.updated_at !== thought.created_at) {
        const edited = document.createElement("span");
        edited.className = "muted";
        edited.textContent = "· изменено " + ruDate(thought.updated_at);
        meta.appendChild(edited);
      }
      const mins = document.createElement("span");
      mins.textContent = "· ⏱ " + readingTime(thought.body) + " мин";
      meta.appendChild(mins);
      li.appendChild(meta);

      const thoughtTags = parseTags(thought.tags);
      if (thoughtTags.length) {
        const row = document.createElement("div");
        row.className = "tag-row";
        thoughtTags.forEach((tag) => {
          const chip = document.createElement("span");
          chip.className = "tag";
          chip.textContent = "#" + tag;
          row.appendChild(chip);
        });
        li.appendChild(row);
      }

      const body = document.createElement("div");
      body.className = "prose ws-body";
      body.hidden = true;
      body.innerHTML = mdToHtml(thought.body);
      li.appendChild(body);

      const actions = document.createElement("div");
      actions.className = "ws-actions";

      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.className = "btn btn-ghost";
      openBtn.textContent = "Читать";
      openBtn.addEventListener("click", () => {
        body.hidden = !body.hidden;
        openBtn.textContent = body.hidden ? "Читать" : "Свернуть";
      });
      actions.appendChild(openBtn);

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn btn-ghost";
      editBtn.textContent = "Изменить";
      editBtn.addEventListener("click", () => openEditor(thought.id));
      actions.appendChild(editBtn);

      if (canPublish) {
        const pubBtn = document.createElement("button");
        pubBtn.type = "button";
        pubBtn.className = "btn btn-ghost";
        pubBtn.textContent = "Опубликовать в ленте";
        pubBtn.addEventListener("click", () => publish(thought));
        actions.appendChild(pubBtn);
      }

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn btn-danger";
      delBtn.textContent = "Удалить";
      delBtn.addEventListener("click", () => {
        if (!confirm("Удалить мысль «" + thought.title + "»? Это действие необратимо.")) return;
        state.thoughts = state.thoughts.filter((t) => t.id !== thought.id);
        save();
        if (editingId === thought.id) closeEditor();
        render();
      });
      actions.appendChild(delBtn);

      li.appendChild(actions);
      els.list.appendChild(li);
    });

    els.empty.hidden = state.thoughts.length > 0;
  }

  /* ---------- Редактор ---------- */

  function openEditor(id) {
    editingId = id || null;
    const thought = id ? state.thoughts.find((t) => t.id === id) : null;
    els.editorTitle.textContent = thought ? "Правка мысли" : "Новая мысль";
    els.form.title.value = thought ? thought.title : "";
    els.form.tags.value = thought ? thought.tags : "";
    els.form.summary.value = thought ? thought.summary : "";
    els.form.body.value = thought ? thought.body : "";
    els.editor.hidden = false;
    els.editor.scrollIntoView({ behavior: "smooth", block: "nearest" });
    els.form.title.focus();
  }

  function closeEditor() {
    editingId = null;
    els.editor.hidden = true;
    els.form.reset();
    // Убираем якорь, иначе повторное нажатие «Написать» не откроет форму.
    if (requestedNew()) {
      history.replaceState(null, "", location.pathname + location.search);
    }
  }

  els.newBtn.addEventListener("click", () => openEditor(null));
  els.cancelBtn.addEventListener("click", closeEditor);

  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = els.form.title.value.trim();
    const body = els.form.body.value.trim();
    if (title.length < 3) {
      alert("Заголовок должен содержать минимум 3 символа.");
      return;
    }
    if (body.length < 10) {
      alert("Текст слишком короткий — напишите хотя бы пару предложений.");
      return;
    }
    const now = new Date().toISOString();
    const fields = {
      title: title,
      tags: parseTags(els.form.tags.value).join(", "),
      summary: els.form.summary.value.trim(),
      body: body,
    };

    if (editingId) {
      const thought = state.thoughts.find((t) => t.id === editingId);
      Object.assign(thought, fields, { updated_at: now });
    } else {
      state.thoughts.push(Object.assign({
        id: "t" + Date.now() + Math.floor(Math.random() * 1000),
        created_at: now,
        updated_at: now,
      }, fields));
    }
    save();
    closeEditor();
    render();
  });

  /* ---------- Профиль ---------- */

  els.setupForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const nick = els.setupForm.nick.value.trim();
    if (!nick) return;
    state.profile = {
      nick: nick,
      about: els.setupForm.about.value.trim(),
      since: new Date().toISOString(),
    };
    save();
    render();
    openIfRequested();
  });

  els.profileEdit.addEventListener("click", () => {
    els.profileForm.nick.value = state.profile.nick;
    els.profileForm.about.value = state.profile.about || "";
    els.profileForm.hidden = false;
    els.profileForm.nick.focus();
  });

  els.profileCancel.addEventListener("click", () => { els.profileForm.hidden = true; });

  els.profileForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const nick = els.profileForm.nick.value.trim();
    if (!nick) return;
    state.profile.nick = nick;
    state.profile.about = els.profileForm.about.value.trim();
    save();
    els.profileForm.hidden = true;
    render();
  });

  /* ---------- Копия данных ---------- */

  els.exportBtn.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "logos-masterская.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });

  els.importInput.addEventListener("change", () => {
    const file = els.importInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data.profile || !Array.isArray(data.thoughts)) {
          alert("Это не похоже на копию мастерской «Логоса».");
          return;
        }
        if (!confirm("Заменить текущие мысли загруженными из файла?")) return;
        state = data;
        save();
        render();
      } catch (e) {
        alert("Не удалось прочитать файл: он повреждён.");
      }
    };
    reader.readAsText(file);
    els.importInput.value = "";
  });

  /* ---------- Публикация в общей ленте (когда есть сервер) ---------- */

  function publish(thought) {
    const form = document.createElement("form");
    form.method = "post";
    form.action = root.dataset.publishUrl;
    const fields = {
      title: thought.title,
      body: thought.body,
      author: state.profile.nick,
      tags: thought.tags,
      summary: thought.summary,
    };
    Object.keys(fields).forEach((name) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = fields[name];
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
  }

  /* ---------- Переход по «Написать» ---------- */

  // Кнопка «Написать» ведёт сюда с якорем #new: открываем сразу форму,
  // а если профиля ещё нет — помним об этом и откроем после его создания.
  function requestedNew() {
    return location.hash === "#new" || location.hash === "#ws-editor";
  }

  function openIfRequested() {
    if (!requestedNew()) return;
    if (state.profile && state.profile.nick) {
      openEditor(null);
    } else {
      els.setup.scrollIntoView({ behavior: "smooth", block: "start" });
      els.setupForm.nick.focus();
    }
  }

  window.addEventListener("hashchange", openIfRequested);

  render();
  openIfRequested();
})();
