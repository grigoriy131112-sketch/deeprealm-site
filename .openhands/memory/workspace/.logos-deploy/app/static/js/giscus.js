// Отклики через Giscus: обсуждения хранятся в GitHub Discussions, поэтому
// их видят все читатели, а не только автор записи. Скрипт подключается
// только на странице публикации и только когда категория настроена.
(function () {
  const box = document.getElementById("giscus");
  if (!box || !box.dataset.categoryId) return;

  const root = document.documentElement;
  const theme = () =>
    root.getAttribute("data-theme") === "dark" ? "dark_dimmed" : "light";

  const script = document.createElement("script");
  script.src = "https://giscus.app/client.js";
  script.async = true;
  script.crossOrigin = "anonymous";
  Object.assign(script.dataset, {
    repo: box.dataset.repo,
    repoId: box.dataset.repoId,
    category: box.dataset.category,
    categoryId: box.dataset.categoryId,
    mapping: "specific",
    term: box.dataset.term,
    reactionsEnabled: "1",
    emitMetadata: "0",
    inputPosition: "bottom",
    lang: "ru",
    loading: "lazy",
  });

  // Смена темы на сайте должна перекрашивать и окно откликов, иначе светлая
  // форма остаётся на тёмной странице. Тег скрипта Giscus после загрузки
  // убирает из DOM, поэтому смена `data-theme` у него ничего не даёт —
  // тему окна меняем сообщением внутрь него.
  const applyTheme = () => {
    script.setAttribute("data-theme", theme());
    const frame = document.querySelector("iframe.giscus-frame");
    frame?.contentWindow?.postMessage(
      { giscus: { setConfig: { theme: theme() } } },
      "https://giscus.app");
  };
  applyTheme();
  box.appendChild(script);

  new MutationObserver(applyTheme).observe(root, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
})();
