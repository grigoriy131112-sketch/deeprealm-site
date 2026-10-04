src = open("/tmp/ds/diary.html", encoding="utf-8").read()
probe = """
<script>
window.addEventListener('load', async () => {
  try { await document.fonts.ready; } catch(e) {}
  function lum(c) {
    const [r,g,b] = c.match(/\\d+/g).map(Number).map(v => {
      v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4);
    });
    return 0.2126*r + 0.7152*g + 0.0722*b;
  }
  function ratio(a,b){ const l1=lum(a), l2=lum(b); const [hi,lo]=l1>l2?[l1,l2]:[l2,l1]; return +((hi+0.05)/(lo+0.05)).toFixed(2); }
  function blend(fg, bg, a) {
    const f = fg.match(/\\d+/g).map(Number), b = bg.match(/\\d+/g).map(Number);
    return 'rgb(' + f.map((v,i)=>Math.round(v*a + b[i]*(1-a))).join(', ') + ')';
  }
  const res = {};
  for (const theme of ['day','night']) {
    document.documentElement.dataset.theme = theme;
    const paper = document.querySelector('.paper');
    const pcs = getComputedStyle(paper);
    const bf = getComputedStyle(paper, '::before');
    const card = pcs.backgroundColor;
    const raw = bf.backgroundColor;
    let eff;
    if (raw.startsWith('rgba')) {
      const p = raw.match(/[\\d.]+/g).map(Number);
      eff = blend('rgb('+p[0]+','+p[1]+','+p[2]+')', card, p[3]);
    } else eff = raw;
    res[theme] = {
      card: card, lineRaw: raw, lineEffective: eff,
      contrast: ratio(eff, card),
      lineWidth: bf.width
    };
  }
  document.documentElement.dataset.theme = 'day';
  const pre = document.createElement('pre');
  pre.textContent = String.fromCharCode(1) + JSON.stringify(res) + String.fromCharCode(2);
  document.body.appendChild(pre);
});
</script>
"""
open("/tmp/ds/test5.html", "w", encoding="utf-8").write(
    src.replace("</body>", probe + "</body>"))
print("ok")
