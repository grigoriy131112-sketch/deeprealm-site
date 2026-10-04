src = open("/tmp/ds/live/diary.html", encoding="utf-8").read()
probe = """
<script>
window.addEventListener('load', async () => {
  try { await document.fonts.ready; } catch(e) {}
  const b = document.getElementById('dbody');
  b.innerHTML = 'Сегодня был хороший день и я многое успел сделать за это время, и хочу записать это в дневник чтобы не забыть.';
  document.getElementById('dtitle').value = 'Тёплый вечер';
  document.documentElement.dataset.theme =
    new URLSearchParams(location.search).get('t') || 'day';
});
</script>
"""
open("/tmp/ds/live/filled.html", "w", encoding="utf-8").write(
    src.replace("</body>", probe + "</body>"))
print("ok")
