"""Картинки для статьи про «Логос» — в палитре самого сайта.

Пять изображений 1200×675: обложка, лента, что умеет, устройство и как
открыть. Файлы кладутся в app/static/img, откуда сборка копирует их на
сайт, а статья берёт ссылками оттуда же.

    python3 preview-src/make_logos_images.py
"""
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 675
FB = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
OUT = "/workspace/project/.logos-deploy/app/static/img"

# Палитра «Логоса»: бумага, чернила, терракота, золото.
PAPER = (247, 243, 236)
RAISED = (255, 253, 248)
INK = (34, 31, 26)
SOFT = (91, 84, 74)
FAINT = (138, 129, 117)
LINE = (226, 218, 205)
ACCENT = (156, 59, 31)
ACCENT_SOFT = (240, 226, 217)
GOLD = (184, 134, 59)


def font(path, size):
    return ImageFont.truetype(path, size)


def base(title_text, accent=ACCENT):
    """Бумажный фон с книжной полосой слева и заголовком."""
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)
    for i in range(H):
        t = i / H
        c = tuple(int(PAPER[k] * (1 - t * 0.035)) for k in range(3))
        d.line([(0, i), (W, i)], fill=c)
    d.rectangle([0, 0, 9, H], fill=accent)
    # Тонкая декоративная окружность — как оттиск.
    d.ellipse([W - 280, -170, W + 130, 240], outline=LINE, width=3)
    d.ellipse([W - 230, -120, W + 80, 190], outline=LINE, width=2)
    d.text((64, 50), title_text, font=font(FB, 44), fill=INK)
    d.rectangle([64, 118, 64 + 120, 124], fill=GOLD)
    return img, d


def card(d, box, fill=RAISED, outline=LINE, radius=16):
    d.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=2)


def circle(d, cx, cy, r, fill, text=None, tcol=RAISED, size=32):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill)
    if text is not None:
        f = font(FB, size)
        d.text((cx - d.textlength(text, font=f) / 2, cy - size * 0.62), text, font=f, fill=tcol)


def wrap(d, text, f, limit):
    words, line, lines = text.split(), "", []
    for wd in words:
        t = (line + " " + wd).strip()
        if d.textlength(t, font=f) < limit:
            line = t
        else:
            lines.append(line)
            line = wd
    if line:
        lines.append(line)
    return lines


# ---------- 1. Обложка ----------
def cover(path):
    img, d = base("«Логос»", ACCENT)
    d.text((64, 150), "блог для мыслей", font=font(FB, 86), fill=INK)
    d.text((64, 250), "и публикаций", font=font(FB, 86), fill=ACCENT)
    d.text((64, 372), "Тексты, темы, отклики — всё на своём месте.",
           font=font(FR, 27), fill=SOFT)
    card(d, [64, 440, 700, 545])
    d.text((96, 468), "grigoriy131112-sketch.github.io", font=font(FR, 24), fill=SOFT)
    d.text((96, 500), "/logos", font=font(FB, 26), fill=ACCENT)
    d.text((64, 590), "Хостинг — бесплатно. Отклики видит весь мир.",
           font=font(FR, 23), fill=FAINT)
    img.save(path)


# ---------- 2. Что это: лента ----------
def feed(path):
    img, d = base("Что это")
    d.text((64, 132), "Лента публикаций — как выглядит главная", font=font(FR, 26), fill=SOFT)
    x, y, sw = 64, 186, 540
    for i, (t, sub) in enumerate([
        ("О смысле слова", "Анна · 4 мин чтения"),
        ("Зачем нужны темы", "Пётр · 3 мин чтения"),
        ("Как писать чаще", "Редакция · 5 мин чтения"),
    ]):
        card(d, [x, y, x + sw, y + 116])
        d.rectangle([x, y + 20, x + 4, y + 96], fill=GOLD)
        d.text((x + 26, y + 22), t, font=font(FB, 30), fill=INK)
        d.text((x + 26, y + 66), sub, font=font(FR, 23), fill=FAINT)
        y += 134
    # Сводка справа.
    card(d, [636, 186, W - 64, 186 + 388], fill=ACCENT_SOFT)
    d.text((668, 214), "Что есть на сайте", font=font(FB, 30), fill=INK)
    rows = ["темы и облако тем", "поиск по тексту", "страницы авторов", "тёмная и светлая темы",
            "реакции и отклики"]
    ry = 268
    for r in rows:
        circle(d, 682, ry + 13, 9, ACCENT)
        d.text((706, ry), r, font=font(FR, 24), fill=SOFT)
        ry += 44
    img.save(path)


# ---------- 3. Что умеет ----------
def features(path):
    img, d = base("Что умеет")
    items = [
        ("Публикации с разметкой", "заголовки, списки, ссылки, цитаты"),
        ("Лента и время чтения", "описание, дата, сколько минут читать"),
        ("Поиск по тексту", "по заголовку и содержимому, с кириллицей"),
        ("Темы и облако тем", "клик по теме — все тексты о ней"),
        ("Отклики под записью", "обсуждение видит весь мир"),
        ("Мастерская читателя", "личные записи без регистрации"),
    ]
    cw, ch = (W - 190) // 2, 116
    for i, (head, sub) in enumerate(items):
        cx = 64 + (i % 2) * (cw + 46)
        cy = 178 + (i // 2) * (ch + 24)
        card(d, [cx, cy, cx + cw, cy + ch])
        circle(d, cx + 46, cy + 58, 22, ACCENT, str(i + 1), size=26)
        d.text((cx + 84, cy + 24), head, font=font(FB, 27), fill=INK)
        d.text((cx + 84, cy + 64), sub, font=font(FR, 21), fill=FAINT)
    img.save(path)


# ---------- 4. Из чего сделан ----------
def stack(path):
    img, d = base("Из чего сделан")
    tech = ["Python", "Flask", "SQLite", "Markdown", "CSS", "JavaScript"]
    x, y = 64, 190
    for i, t in enumerate(tech):
        cw = 40 + int(d.textlength(t, font=font(FB, 25)))
        card(d, [x, y, x + cw, y + 58], fill=ACCENT_SOFT, outline=ACCENT_SOFT)
        d.text((x + 20, y + 15), t, font=font(FB, 25), fill=ACCENT)
        x += cw + 18
        if x > W - 260 and i < len(tech) - 1:
            x, y = 64, y + 74
    card(d, [64, 420, W - 64, 610])
    d.text((96, 452), "Хостинг — GitHub Pages: бесплатно и надёжно.", font=font(FB, 28), fill=INK)
    lines = wrap(d, "На GitHub Pages нет сервера, поэтому обычные комментарии там "
                    "не работают. Их заменили отклики на GitHub Discussions: "
                    "обсуждение под каждой записью своё.", font(FR, 23), W - 200)
    yy = 500
    for ln in lines:
        d.text((96, yy), ln, font=font(FR, 23), fill=SOFT)
        yy += 32
    img.save(path)


# ---------- 5. Как открыть ----------
def open_site(path):
    img, d = base("Как открыть", GOLD)
    card(d, [64, 190, W - 64, 330], fill=ACCENT_SOFT, outline=ACCENT_SOFT)
    d.text((100, 224), "Адрес сайта", font=font(FR, 24), fill=SOFT)
    d.text((100, 262), "grigoriy131112-sketch.github.io/logos/", font=font(FB, 30), fill=ACCENT)
    rows = [
        ("Лента RSS", "подписаться на новые тексты"),
        ("О блоге", "как он устроен внутри"),
        ("Мастерская", "свои записи без регистрации"),
    ]
    y = 372
    for head, sub in rows:
        card(d, [64, y, W - 64, y + 86])
        circle(d, 108, y + 43, 13, GOLD)
        d.text((136, y + 18), head, font=font(FB, 26), fill=INK)
        d.text((136, y + 50), sub, font=font(FR, 21), fill=FAINT)
        y += 100
    img.save(path)


for name, fn in [("logos-1.png", cover), ("logos-2.png", feed), ("logos-3.png", features),
                 ("logos-4.png", stack), ("logos-5.png", open_site)]:
    fn(f"{OUT}/{name}")
    print("готово:", name)
