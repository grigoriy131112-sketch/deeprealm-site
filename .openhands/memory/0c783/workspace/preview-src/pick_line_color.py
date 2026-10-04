import re, json, subprocess

src = open("/tmp/ds/diary.html", encoding="utf-8").read()
probe = """
<script>
window.addEventListener('load', async () => {
  function lum(c) {
    const [r,g,b] = c.match(/\\d+/g).map(Number).map(v => {
      v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4);
    });
    return 0.2126*r + 0.7152*g + 0.0722*b;
  }
  function ratio(a,b){ const l1=lum(a), l2=lum(b); const [hi,lo]=l1>l2?[l1,l2]:[l2,l1]; return +((hi+0.05)/(lo+0.05)).toFixed(2); }
  const cands = ['#E06A6A','#DC5F5F','#D95656','#D14B4B','#C94444','#C0392B'];
  const res = {};
  const paper = document.querySelector('.paper');
  const card = getComputedStyle(paper).backgroundColor;
  for (const c of cands) res[c] = ratio(c, card);
  const pre = document.createElement('pre');
  pre.textContent = String.fromCharCode(1) + JSON.stringify({card, res}) + String.fromCharCode(2);
  document.body.appendChild(pre);
});
</script>
"""
open("/tmp/ds/test6.html", "w", encoding="utf-8").write(src.replace("</body>", probe + "</body>"))
out = subprocess.run(["chromium","--headless","--no-sandbox","--disable-gpu","--hide-scrollbars",
    "--virtual-time-budget=8000","--window-size=1440,900","--dump-dom","file:///tmp/ds/test6.html"],
    capture_output=True, text=True).stdout
m = re.search(r"\x01(.*?)\x02", out)
d = json.loads(m.group(1))
print("фон карточки:", d["card"])
for c, r in sorted(d["res"].items(), key=lambda x: x[1]):
    mark = "  <- сейчас" if c == "#E06A6A" else ""
    print(f"  {c}  контраст {r}{mark}")
