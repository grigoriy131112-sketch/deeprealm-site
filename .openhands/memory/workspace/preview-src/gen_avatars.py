import pathlib

BASE = """<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:512px; height:512px; }
  body { font-family:"DejaVu Sans",sans-serif; overflow:hidden; position:relative; }
  .center { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; }
__CSS__
</style></head>
<body>
__BODY__
</body></html>
"""

# ---------- A: яркий градиент + код ----------
A_CSS = """
  body { background:linear-gradient(135deg,#5b3cff 0%,#7c3cff 40%,#00b8a9 100%); }
  .glow { position:absolute; width:420px; height:420px; border-radius:50%;
    background:radial-gradient(circle,rgba(255,255,255,.35),transparent 65%);
    top:-90px; left:-70px; }
  .glow2 { position:absolute; width:380px; height:380px; border-radius:50%;
    background:radial-gradient(circle,rgba(0,230,168,.45),transparent 65%);
    bottom:-120px; right:-100px; }
  .mark { position:relative; font-size:210px; font-weight:700; color:#fff; letter-spacing:-8px;
    text-shadow:0 12px 40px rgba(0,0,0,.30); }
  .dot { position:absolute; width:26px; height:26px; border-radius:50%;
    background:#00e6a8; box-shadow:0 0 24px #00e6a8; top:118px; right:104px; }
"""
A_BODY = """  <div class="glow"></div><div class="glow2"></div>
  <div class="center"><div class="mark">&lt;/&gt;</div></div>
  <div class="dot"></div>"""

# ---------- B: тёмный + неоновое кольцо ----------
B_CSS = """
  body { background:#0b1020; }
  .grid { position:absolute; inset:0;
    background-image:linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),
                     linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px);
    background-size:52px 52px;
    -webkit-mask-image:radial-gradient(circle at 50% 50%,#000 0%,transparent 72%);
    mask-image:radial-gradient(circle at 50% 50%,#000 0%,transparent 72%); }
  .ring { position:absolute; width:360px; height:360px; border-radius:50%;
    border:10px solid transparent; left:50%; top:50%; transform:translate(-50%,-50%);
    background:linear-gradient(#0b1020,#0b1020) padding-box,
      linear-gradient(135deg,#7c6bff,#00d4b8,#ffd166) border-box;
    box-shadow:0 0 60px rgba(91,60,255,.55); }
  .mark { position:relative; font-size:158px; font-weight:700; letter-spacing:-6px;
    background:linear-gradient(100deg,#7c6bff,#00d4b8 60%,#ffd166);
    -webkit-background-clip:text; background-clip:text; color:transparent; }
"""
B_BODY = """  <div class="grid"></div>
  <div class="ring"></div>
  <div class="center"><div class="mark">&lt;/&gt;</div></div>"""

# ---------- C: окно браузера + код ----------
C_CSS = """
  body { background:radial-gradient(circle at 30% 25%,#1a2350 0%,#0b1020 70%); }
  .glow { position:absolute; width:460px; height:460px; border-radius:50%;
    background:radial-gradient(circle,rgba(91,60,255,.55),transparent 65%);
    top:-140px; left:-120px; }
  .glow2 { position:absolute; width:420px; height:420px; border-radius:50%;
    background:radial-gradient(circle,rgba(0,212,184,.42),transparent 65%);
    bottom:-160px; right:-140px; }
  .win { position:relative; width:330px; border-radius:26px; overflow:hidden;
    background:rgba(255,255,255,.07); border:2px solid rgba(255,255,255,.20);
    box-shadow:0 24px 70px rgba(0,0,0,.5); }
  .bar { height:52px; display:flex; align-items:center; gap:10px; padding:0 20px;
    background:rgba(255,255,255,.08); }
  .b { width:14px; height:14px; border-radius:50%; }
  .b1{background:#ff5f57;} .b2{background:#ffbd2e;} .b3{background:#28c840;}
  .code { padding:26px 22px 32px; }
  .ln { height:14px; border-radius:8px; margin-bottom:16px;
    background:linear-gradient(90deg,rgba(255,255,255,.55),rgba(255,255,255,.15)); }
  .l1{width:62%;} .l2{width:82%;} .l3{width:46%;}
  .l4{width:70%; background:linear-gradient(90deg,#7c6bff,#00d4b8);}
  .l5{width:38%; background:linear-gradient(90deg,#ffd166,#ff9d5c);}
  .cursor { display:inline-block; width:5px; height:22px; background:#00e6a8;
    box-shadow:0 0 14px #00e6a8; margin-left:6px; vertical-align:middle; }
"""
C_BODY = """  <div class="glow"></div><div class="glow2"></div>
  <div class="center">
    <div class="win">
      <div class="bar"><span class="b b1"></span><span class="b b2"></span><span class="b b3"></span></div>
      <div class="code">
        <div class="ln l1"></div><div class="ln l2"></div><div class="ln l3"></div>
        <div class="ln l4"></div><div class="ln l5"></div><span class="cursor"></span>
      </div>
    </div>
  </div>"""

variants = {"avatar-a": (A_CSS, A_BODY), "avatar-b": (B_CSS, B_BODY), "avatar-c": (C_CSS, C_BODY)}

out = pathlib.Path(__file__).parent
for key, (css, body) in variants.items():
    html = BASE.replace("__CSS__", css).replace("__BODY__", body)
    (out / f"{key}.html").write_text(html, encoding="utf-8")
    print("wrote", out / f"{key}.html")
