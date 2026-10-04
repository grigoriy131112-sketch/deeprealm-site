import pathlib

TPL = """<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:1280px; height:720px; }
  body { font-family:"DejaVu Sans",sans-serif; background:#0b1020; color:#fff; overflow:hidden; position:relative; }
  .glow1,.glow2,.glow3 { position:absolute; border-radius:50%; filter:blur(90px); }
  .glow1 { width:640px; height:640px; background:#5b3cff; opacity:.55; top:-240px; left:-170px; }
  .glow2 { width:560px; height:560px; background:#00d4b8; opacity:.34; bottom:-250px; right:-130px; }
  .glow3 { width:360px; height:360px; background:#ff4d8d; opacity:.20; top:300px; right:340px; }
  .grid { position:absolute; inset:0;
    background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),
                     linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);
    background-size:64px 64px;
    -webkit-mask-image:radial-gradient(circle at 30% 40%,#000 0%,transparent 78%);
    mask-image:radial-gradient(circle at 30% 40%,#000 0%,transparent 78%); }
  .wrap { position:relative; z-index:5; padding:74px 84px; height:100%;
    display:flex; flex-direction:column; justify-content:center; }
  .badge { display:inline-flex; align-items:center; gap:12px; align-self:flex-start;
    padding:12px 24px; border:1px solid rgba(255,255,255,.22); background:rgba(255,255,255,.06);
    border-radius:100px; font-size:21px; color:#d7dcff; margin-bottom:30px; }
  .dot { width:12px; height:12px; border-radius:50%; background:#00e6a8; box-shadow:0 0 16px #00e6a8; }
  h1 { font-size:__SIZE__px; line-height:1.02; font-weight:700; letter-spacing:-2px; margin-bottom:20px; }
  .grad { background:linear-gradient(100deg,#7c6bff 0%,#00d4b8 58%,#ffd166 100%);
    -webkit-background-clip:text; background-clip:text; color:transparent; }
  .tag { font-size:31px; font-weight:700; color:#eef0ff; margin-bottom:18px; }
  .sub { font-size:25px; line-height:1.5; color:#a9b0d0; max-width:860px; margin-bottom:42px; }
  .row { display:flex; gap:16px; }
  .chip { font-size:20px; color:#e8ebff; padding:14px 26px; border-radius:14px;
    background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.12); }
  .foot { position:absolute; bottom:50px; left:84px; right:84px; display:flex;
    align-items:center; justify-content:space-between; font-size:22px; color:#8b93b8; }
  .cta { display:inline-flex; align-items:center; gap:12px; padding:16px 32px; border-radius:100px;
    background:linear-gradient(100deg,#5b3cff,#00b8a9); color:#fff; font-size:22px; font-weight:700;
    box-shadow:0 14px 40px rgba(91,60,255,.45); }
</style>
</head>
<body>
  <div class="glow1"></div><div class="glow2"></div><div class="glow3"></div>
  <div class="grid"></div>
  <div class="wrap">
    <div class="badge"><span class="dot"></span>Telegram-канал · сайты на заказ</div>
    <h1>__NAME__</h1>
    <div class="tag">Создание <span class="grad">сайтов под ключ</span></div>
    <div class="sub">Для бизнеса и для себя. Визитка, портфолио, блог или магазин — дизайн, вёрстка и запуск от идеи до готового сайта.</div>
    <div class="row">
      <div class="chip">Личный сайт</div>
      <div class="chip">Портфолио</div>
      <div class="chip">Блог</div>
      <div class="chip">Магазин</div>
    </div>
  </div>
  <div class="foot">
    <span>Свой сайт — проще, чем кажется</span>
    <span>От идеи до запуска</span>
  </div>
</body>
</html>
"""

# name -> (font size, gradient part)
variants = {
    "name-a": ("Веб<span class=\"grad\">Фабрика</span>", 112),
    "name-b": ("Пиксель <span class=\"grad\">и Код</span>", 100),
    "name-c": ("Сайт<span class=\"grad\">Мастер</span>", 112),
}

out = pathlib.Path(__file__).parent
for key, (name, size) in variants.items():
    html = TPL.replace("__NAME__", name).replace("__SIZE__", str(size))
    (out / f"{key}.html").write_text(html, encoding="utf-8")
    print("wrote", out / f"{key}.html")
