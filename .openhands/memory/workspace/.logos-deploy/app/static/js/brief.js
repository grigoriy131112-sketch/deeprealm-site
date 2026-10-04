// Копирование шаблонов брифа: заказчику проще вставить в сообщение
// готовый текст, чем выделять его мышью с телефона.
(function () {
  document.querySelectorAll(".copy-btn").forEach((button) => {
    const source = document.getElementById(button.dataset.copy);
    if (!source) return;
    const original = button.textContent.trim();

    button.addEventListener("click", async () => {
      const text = source.textContent;
      try {
        await navigator.clipboard.writeText(text);
        button.textContent = "Скопировано ✓";
      } catch (e) {
        // Без https и в старых браузерах буфер обмена недоступен —
        // выделяем текст, чтобы его можно было скопировать вручную.
        const range = document.createRange();
        range.selectNodeContents(source);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        button.textContent = "Выделено — скопируйте";
      }
      setTimeout(() => { button.textContent = original; }, 2200);
    });
  });
})();
