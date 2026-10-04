// Статическая версия «Логоса»: то, что на сервере делал Flask, делаем в браузере.
(function () {
  /* ---------- Случайная мысль ---------- */
  // Сервера нет, поэтому публикации перечислены прямо в ссылке, а выбор
  // случая происходит на месте.
  const randomLink = document.getElementById("random-link");
  if (randomLink) {
    const posts = (randomLink.dataset.posts || "").split(",").filter(Boolean);
    randomLink.addEventListener("click", (event) => {
      if (!posts.length) return;
      event.preventDefault();
      const pick = posts[Math.floor(Math.random() * posts.length)];
      window.location.href = pick;
    });
  }

  /* ---------- Поиск ---------- */
  // Ищем по уже загруженной ленте: без сервера доступен только тот список
  // публикаций, что есть на странице.
  const searchForm = document.querySelector(".search");
  if (searchForm) {
    const input = searchForm.querySelector('input[type="search"]');
    const feed = document.querySelector(".feed");
    const heading = feed ? feed.querySelector("h2") : null;
    const cards = Array.from(document.querySelectorAll(".post-card"));

    const run = () => {
      const needle = (input.value || "").trim().toLowerCase();
      let shown = 0;
      cards.forEach((card) => {
        const text = card.textContent.toLowerCase();
        const hit = !needle || text.includes(needle);
        card.style.display = hit ? "" : "none";
        if (hit) shown += 1;
      });
      if (heading) {
        heading.textContent = needle
          ? `Поиск: «${input.value.trim()}»`
          : "Свежие публикации";
      }
      let note = document.querySelector(".static-search-note");
      if (needle && shown === 0) {
        if (!note) {
          note = document.createElement("p");
          note.className = "empty static-search-note";
          note.textContent =
            "На этой странице ничего не нашлось. Откройте ленту и попробуйте снова.";
          feed.appendChild(note);
        }
      } else if (note) {
        note.remove();
      }
    };

    searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      run();
    });
    input.addEventListener("input", run);
  }
})();
