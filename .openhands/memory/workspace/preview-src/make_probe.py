import sys

src = open("/tmp/ds/diary.html", encoding="utf-8").read()
probe = """
<script>
window.addEventListener('load', async () => {
  try { await document.fonts.ready; } catch(e) {}
  const body = document.getElementById('dbody');
  body.innerHTML = 'Сегодня был хороший день и я многое успел';
  const cs = getComputedStyle(body);
  const cv = document.createElement('canvas').getContext('2d');
  cv.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
  const paper = document.querySelector('.paper');
  const pcs = getComputedStyle(paper);
  const bf = getComputedStyle(paper, '::before');
  const wrap = document.querySelector('.wrap');
  const out = {
    viewport: [innerWidth, innerHeight],
    fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight,
    letterSpacing: cs.letterSpacing, wordSpacing: cs.wordSpacing, lineHeight: cs.lineHeight,
    spaceWidth: +cv.measureText(' ').width.toFixed(2),
    nWidth: +cv.measureText('н').width.toFixed(2),
    paperPadding: [pcs.paddingTop, pcs.paddingRight, pcs.paddingBottom, pcs.paddingLeft],
    lineLeft: bf.left, lineWidth: bf.width, lineColor: bf.backgroundColor,
    paperLeft: +paper.getBoundingClientRect().left.toFixed(1),
    paperWidth: +paper.getBoundingClientRect().width.toFixed(1),
    bodyLeft: +body.getBoundingClientRect().left.toFixed(1),
    bodyWidth: +body.getBoundingClientRect().width.toFixed(1),
    wrapWidth: +wrap.getBoundingClientRect().width.toFixed(1)
  };
  const pre = document.createElement('pre');
  pre.textContent = 'RESULT>>>' + JSON.stringify(out) + '<<<RESULT';
  document.body.appendChild(pre);
});
</script>
"""
open("/tmp/ds/test.html", "w", encoding="utf-8").write(
    src.replace("</body>", probe + "</body>"))
print("test.html создан")
