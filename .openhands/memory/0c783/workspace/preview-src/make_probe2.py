import re

src = open("/tmp/ds/diary.html", encoding="utf-8").read()
probe = """
<script>
window.addEventListener('load', async () => {
  try { await document.fonts.ready; } catch(e) {}
  const cv = document.createElement('canvas').getContext('2d');
  const meas = (font) => {
    cv.font = font;
    return {
      space: +cv.measureText(' ').width.toFixed(2),
      n: +cv.measureText('н').width.toFixed(2),
      word: +cv.measureText('Сегодня').width.toFixed(2)
    };
  };
  const body = document.getElementById('dbody');
  const cs = getComputedStyle(body);
  const loaded = [...document.fonts].map(f => f.family + '|' + f.weight + '|' + f.status);
  const out = {
    fontsCheckMulish500: document.fonts.check('500 16px Mulish'),
    fontsLoaded: loaded.slice(0, 12),
    computed: cs.fontFamily,
    mulish: meas('500 16px Mulish'),
    fallback: meas('500 16px system-ui'),
    serif: meas('500 16px Georgia')
  };
  const pre = document.createElement('pre');
  pre.textContent = String.fromCharCode(1) + JSON.stringify(out) + String.fromCharCode(2);
  document.body.appendChild(pre);
});
</script>
"""
open("/tmp/ds/test2.html", "w", encoding="utf-8").write(
    src.replace("</body>", probe + "</body>"))
print("ok")
