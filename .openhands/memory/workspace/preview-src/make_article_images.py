from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 675
FB = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

BG = (14, 33, 52)
CARD = (24, 48, 72)
ACCENT = (86, 196, 255)
WHITE = (255, 255, 255)
MUTED = (178, 192, 210)


def font(path, size):
    return ImageFont.truetype(path, size)


def base(accent=ACCENT):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    for i in range(H):
        t = i / H
        c = tuple(int(BG[k] * (1 - t * 0.45)) for k in range(3))
        d.line([(0, i), (W, i)], fill=c)
    d.rectangle([0, 0, 10, H], fill=accent)
    d.ellipse([W - 300, -180, W + 120, 240], outline=accent, width=3)
    return img, d


def title(d, text, accent=ACCENT):
    d.text((60, 52), text, font=font(FB, 46), fill=WHITE)
    d.rectangle([60, 122, 60 + 120, 128], fill=accent)


def rrect(d, box, r=18, fill=CARD, outline=None, width=2):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


def badge(d, cx, cy, text, accent=ACCENT):
    d.ellipse([cx - 26, cy - 26, cx + 26, cy + 26], fill=accent)
    f = font(FB, 30)
    w = d.textlength(text, font=f)
    d.text((cx - w / 2, cy - 18), text, font=f, fill=BG)


def fit(text, f, limit):
    return font(f, 1) and ImageFont.truetype(f, 1)


# ---------- 1. Этапы работы ----------
def steps(path):
    img, d = base()
    title(d, "Как проходит работа")
    rows = [
        ("1", "Вы заполняете бриф", "10 вопросов, 2 минуты, своими словами"),
        ("2", "Согласуем структуру", "какие страницы и что на них будет"),
        ("3", "Делаю сайт", "показываю по ходу, правим сразу"),
        ("4", "Отдаю готовое", "проверяю на телефоне и компьютере"),
    ]
    y = 170
    for num, head, sub in rows:
        rrect(d, [60, y, W - 60, y + 104])
        badge(d, 118, y + 52, num)
        d.text((168, y + 22), head, font=font(FB, 32), fill=WHITE)
        d.text((168, y + 62), sub, font=font(FR, 24), fill=MUTED)
        y += 118
    img.save(path)


# ---------- 2. Какие сайты ----------
def kinds(path):
    img, d = base()
    title(d, "Какие сайты я делаю")
    items = [
        ("Лендинг", "одна страница, которая продаёт"),
        ("Визитка", "для мастера, кафе, салона"),
        ("Портфолио", "фотографу, дизайнеру, художнику"),
        ("Блог", "чтобы тексты жили в одном месте"),
        ("Интернет-магазин", "каталог и корзина"),
        ("Приглашение", "на свадьбу или праздник"),
    ]
    cols, cw = 2, (W - 150) // 2
    for i, (head, sub) in enumerate(items):
        cx = 60 + (i % cols) * (cw + 30)
        cy = 168 + (i // cols) * 140
        rrect(d, [cx, cy, cx + cw, cy + 118])
        d.ellipse([cx + 24, cy + 34, cx + 74, cy + 84], fill=ACCENT)
        d.text((cx + 100, cy + 26), head, font=font(FB, 30), fill=WHITE)
        d.text((cx + 100, cy + 68), sub, font=font(FR, 22), fill=MUTED)
    img.save(path)


# ---------- 3. Что даёт сайт ----------
def gives(path):
    img, d = base()
    title(d, "Что даёт сайт небольшому делу")
    rows = [
        ("Вас можно найти", "ссылка вместо «где-то в переписке»"),
        ("Понятно за минуту", "услуги, цены, контакты без догадок"),
        ("Заявки без вас", "работает ночью, в выходные, в отпуске"),
    ]
    y = 190
    for i, (head, sub) in enumerate(rows, 1):
        rrect(d, [60, y, W - 60, y + 130], outline=(40, 78, 112))
        badge(d, 120, y + 65, str(i))
        d.text((180, y + 32), head, font=font(FB, 36), fill=WHITE)
        d.text((180, y + 82), sub, font=font(FR, 25), fill=MUTED)
        y += 150
    img.save(path)


# ---------- 4. С чего начать ----------
def start(path):
    img, d = base(accent=(120, 226, 168))
    title(d, "С чего начать", accent=(120, 226, 168))
    steps = [
        ("Открыть бриф", "ссылка в конце статьи"),
        ("Ответить на 10 вопросов", "2 минуты, ничего не стоит"),
        ("Написать мне", "слово «бриф» — подскажу под вашу задачу"),
    ]
    x = 60
    cw = (W - 190) // 3
    for i, (head, sub) in enumerate(steps, 1):
        rrect(d, [x, 210, x + cw, 460], outline=(60, 120, 96))
        d.ellipse([x + 30, 240, x + 90, 300], fill=(120, 226, 168))
        f = font(FB, 34)
        d.text((x + 60 - d.textlength(str(i), font=f) / 2, 252), str(i), font=f, fill=BG)
        # переносим заголовок вручную
        words = head.split()
        line, lines = "", []
        for wd in words:
            t = (line + " " + wd).strip()
            if d.textlength(t, font=font(FB, 28)) < cw - 60:
                line = t
            else:
                lines.append(line)
                line = wd
        lines.append(line)
        yy = 330
        for ln in lines:
            d.text((x + 30, yy), ln, font=font(FB, 28), fill=WHITE)
            yy += 36
        # подпись с переносом
        words = sub.split()
        line, lines = "", []
        for wd in words:
            t = (line + " " + wd).strip()
            if d.textlength(t, font=font(FR, 20)) < cw - 60:
                line = t
            else:
                lines.append(line)
                line = wd
        lines.append(line)
        yy += 8
        for ln in lines:
            d.text((x + 30, yy), ln, font=font(FR, 20), fill=MUTED)
            yy += 26
        x += cw + 35
    img.save(path)


for name, fn in [("art-1.png", steps), ("art-2.png", kinds),
                 ("art-3.png", gives), ("art-4.png", start)]:
    fn(name)
    print("готово:", name)
