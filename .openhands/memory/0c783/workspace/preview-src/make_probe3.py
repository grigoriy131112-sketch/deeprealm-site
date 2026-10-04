src = open("/tmp/ds/diary.html", encoding="utf-8").read()
probe = """
<script>
window.addEventListener('load', async () => {
  try { await document.fonts.ready; } catch(e) {}
  const body = document.getElementById('dbody');
  const TEXT = 'Сегодня был хороший день и я многое успел сделать за это время';
  body.innerHTML = TEXT;
  const paper = document.querySelector('.paper');
  const pr = paper.getBoundingClientRect();
  const br = body.getBoundingClientRect();
  const pcs = getComputedStyle(paper);
  const bcs = getComputedStyle(body);
  const bf = getComputedStyle(paper, '::before');
  const borderL = parseFloat(pcs.borderLeftWidth) || 0;
  const lineX = pr.left + borderL + parseFloat(bf.left);

  // замеряем каждое слово через Range
  const node = body.firstChild;
  const words = [];
  const re = /\\S+/g; let m;
  while ((m = re.exec(TEXT))) {
    const r = document.createRange();
    r.setStart(node, m.index); r.setEnd(node, m.index + m[0].length);
    const rect = r.getBoundingClientRect();
    words.push({ w: m[0], l: +rect.left.toFixed(1), r: +rect.right.toFixed(1) });
  }
  const gaps = [];
  for (let i = 0; i < words.length - 1; i++)
    gaps.push(+(words[i+1].l - words[i].r).toFixed(1));

  const out = {
    viewport: innerWidth, dpr: devicePixelRatio,
    font: bcs.fontFamily, size: bcs.fontSize, weight: bcs.fontWeight,
    wordSpacing: bcs.wordSpacing, letterSpacing: bcs.letterSpacing,
    mulishLoaded: document.fonts.check('500 16px Mulish'),
    paperLeft: +pr.left.toFixed(1), paperRight: +pr.right.toFixed(1),
    paddingLeft: pcs.paddingLeft,
    textLeft: +br.left.toFixed(1), textRight: +br.right.toFixed(1),
    lineX: +lineX.toFixed(1), lineColor: bf.backgroundColor,
    gapLineToText: +(br.left - lineX).toFixed(1),
    cardBg: pcs.backgroundColor,
    wordGaps: gaps,
    avgGap: gaps.length ? +(gaps.reduce((a,b)=>a+b,0)/gaps.length).toFixed(2) : null,
    overflowRight: +(br.right - pr.right).toFixed(1)
  };
  const pre = document.createElement('pre');
  pre.textContent = String.fromCharCode(1) + JSON.stringify(out) + String.fromCharCode(2);
  document.body.appendChild(pre);
});
</script>
"""
open("/tmp/ds/test3.html", "w", encoding="utf-8").write(
    src.replace("</body>", probe + "</body>"))
print("ok")
