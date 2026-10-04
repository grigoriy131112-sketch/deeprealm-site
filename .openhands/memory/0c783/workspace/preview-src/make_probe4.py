src = open("/tmp/ds/diary.html", encoding="utf-8").read()
probe = """
<script>
window.addEventListener('load', async () => {
  try { await document.fonts.ready; } catch(e) {}
  const body = document.getElementById('dbody');
  const TEXT = 'Сегодня был хороший день и я многое успел сделать за это время';
  body.innerHTML = TEXT;
  const node = body.firstChild;
  const re = /\\S+/g; let m; const words = [];
  while ((m = re.exec(TEXT))) {
    const r = document.createRange();
    r.setStart(node, m.index); r.setEnd(node, m.index + m[0].length);
    const rect = r.getBoundingClientRect();
    words.push({ w: m[0], l: rect.left, r: rect.right, t: Math.round(rect.top) });
  }
  // только первая строка
  const top = words[0].t;
  const first = words.filter(x => x.t === top);
  const gaps = [];
  for (let i = 0; i < first.length - 1; i++) gaps.push(+(first[i+1].l - first[i].r).toFixed(2));

  const paper = document.querySelector('.paper');
  const pr = paper.getBoundingClientRect();
  const bf = getComputedStyle(paper, '::before');
  const lineX = pr.left + (parseFloat(getComputedStyle(paper).borderLeftWidth)||0) + parseFloat(bf.left);
  const bcs = getComputedStyle(body);

  const out = {
    viewport: innerWidth,
    wordsInFirstLine: first.length,
    gaps: gaps,
    avgGap: gaps.length ? +(gaps.reduce((a,b)=>a+b,0)/gaps.length).toFixed(2) : null,
    wordSpacing: bcs.wordSpacing,
    gapLineToText: +(body.getBoundingClientRect().left - lineX).toFixed(1),
    textLeft: +body.getBoundingClientRect().left.toFixed(1),
    lineX: +lineX.toFixed(1)
  };
  const pre = document.createElement('pre');
  pre.textContent = String.fromCharCode(1) + JSON.stringify(out) + String.fromCharCode(2);
  document.body.appendChild(pre);
});
</script>
"""
open("/tmp/ds/test4.html", "w", encoding="utf-8").write(
    src.replace("</body>", probe + "</body>"))
print("ok")
