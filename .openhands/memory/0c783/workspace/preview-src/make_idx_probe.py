src = open("/tmp/ds/live/index.html", encoding="utf-8").read()
probe = """<script>
window.addEventListener('load', () => setTimeout(() => {
  const d = document.documentElement;
  const wide = [...document.querySelectorAll('body *')]
    .filter(el => el.getBoundingClientRect().right > d.clientWidth + 1)
    .slice(0, 6)
    .map(el => el.tagName + '.' + (el.className || '').toString().split(' ')[0]
              + ' right=' + Math.round(el.getBoundingClientRect().right));
  const out = {scrollW: d.scrollWidth, clientW: d.clientWidth,
               overflow: d.scrollWidth > d.clientWidth, wide: wide};
  const pre = document.createElement('pre');
  pre.textContent = String.fromCharCode(1) + JSON.stringify(out) + String.fromCharCode(2);
  document.body.appendChild(pre);
}, 600));
</script>"""
open("/tmp/ds/live/idx-probe.html", "w", encoding="utf-8").write(
    src.replace("</body>", probe + "</body>"))
print("ok")
