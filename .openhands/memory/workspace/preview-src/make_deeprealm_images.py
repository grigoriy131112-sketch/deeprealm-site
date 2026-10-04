from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 675
FB = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BG = (18, 22, 34)
CARD = (28, 34, 50)
GOLD = (214, 176, 92)
VIOLET = (150, 130, 235)
GREEN = (110, 205, 155)
WHITE = (255, 255, 255)
MUTED = (172, 182, 202)


def f(p, s): return ImageFont.truetype(p, s)


def base(accent):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    for i in range(H):
        d.line([(0, i), (W, i)], fill=tuple(int(BG[k] * (1 - i / H * 0.4)) for k in range(3)))
    d.rectangle([0, 0, 9, H], fill=accent)
    d.ellipse([W - 320, -200, W + 140, 260], outline=accent, width=2)
    d.ellipse([-160, H - 200, 200, H + 160], outline=accent, width=2)
    return img, d


def head(d, text, accent):
    d.text((58, 48), text, font=f(FB, 44), fill=WHITE)
    d.rectangle([58, 116, 178, 122], fill=accent)


def rr(d, box, r=16, fill=CARD, outline=None, w=2):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=w)


def wrap(d, text, font, limit):
    words, line, out = text.split(), "", []
    for w_ in words:
        t = (line + " " + w_).strip()
        if d.textlength(t, font=font) < limit: line = t
        else: out.append(line); line = w_
    out.append(line)
    return out


# ---- 1. Разделы сайта ----
def sections(path):
    img, d = base(GOLD)
    head(d, "Что есть на сайте", GOLD)
    items = [("Главная", "всё важное сразу"), ("Лор мира", "история и континенты"),
             ("Правила", "7 разделов и наказания"), ("Расы", "6 базовых + свои"),
             ("Классы", "5 базовых + свои"), ("Статьи", "поиск и фильтры"),
             ("Пасс уровней", "награды за уровни"), ("Администрация", "команда и роли"),
             ("Проводник", "ИИ-справочник")]
    cw = (W - 150) // 3
    for i, (h, s) in enumerate(items):
        cx = 58 + (i % 3) * (cw + 18)
        cy = 158 + (i // 3) * 132
        rr(d, [cx, cy, cx + cw, cy + 114], outline=(58, 66, 92))
        d.rectangle([cx, cy, cx + 5, cy + 114], fill=GOLD)
        d.text((cx + 22, cy + 24), h, font=f(FB, 27), fill=WHITE)
        d.text((cx + 22, cy + 62), s, font=f(FR, 19), fill=MUTED)
    img.save(path)


# ---- 2. Расы и классы ----
def races(path):
    img, d = base(VIOLET)
    head(d, "Расы и классы", VIOLET)
    rr(d, [58, 156, 566, 600], outline=(70, 66, 116))
    d.text((84, 176), "Расы", font=f(FB, 30), fill=VIOLET)
    for i, r in enumerate(["Человек", "Эльф", "Драконорождённый", "Дворф", "Орк", "Павший"]):
        d.text((84, 228 + i * 54), "•  " + r, font=f(FR, 25), fill=WHITE)
    d.text((84, 556), "+ свои расы от игроков", font=f(FB, 20), fill=GOLD)

    rr(d, [610, 156, W - 58, 600], outline=(70, 66, 116))
    d.text((636, 176), "Классы", font=f(FB, 30), fill=VIOLET)
    for i, c in enumerate(["Воин", "Лучник", "Маг", "Некромант", "Чернокнижник"]):
        d.text((636, 228 + i * 54), "•  " + c, font=f(FR, 25), fill=WHITE)
    d.text((636, 512), "+ свои классы:", font=f(FB, 20), fill=GOLD)
    d.text((636, 546), "Магистр сфер, Трикстер,", font=f(FR, 20), fill=MUTED)
    d.text((636, 572), "Секироносец, Флагеллант", font=f(FR, 20), fill=MUTED)
    img.save(path)


# ---- 3. ИИ-помощники ----
def ai(path):
    img, d = base(GREEN)
    head(d, "Три ИИ-помощника", GREEN)
    items = [
        ("Проводник", "отвечает на вопросы о правилах, лоре, расах и классах. Справочник без ролевой игры."),
        ("Анкетолог", "ведёт диалог и помогает собрать анкету персонажа по шагам."),
        ("Анкетолог по кандидатам", "проводит собеседование для тех, кто хочет в команду проекта."),
    ]
    y = 172
    for i, (h, s) in enumerate(items, 1):
        rr(d, [58, y, W - 58, y + 130], outline=(56, 104, 82))
        d.ellipse([86, y + 42, 146, y + 102], fill=GREEN)
        n = str(i)
        d.text((116 - d.textlength(n, font=f(FB, 30)) / 2, y + 54), n, font=f(FB, 30), fill=BG)
        d.text((176, y + 26), h, font=f(FB, 30), fill=WHITE)
        yy = y + 68
        for ln in wrap(d, s, f(FR, 20), W - 260):
            d.text((176, yy), ln, font=f(FR, 20), fill=MUTED); yy += 24
        y += 146
    img.save(path)


# ---- 4. Пасс уровней ----
def passs(path):
    img, d = base(GOLD)
    head(d, "Пасс уровней", GOLD)
    tiers = [("Новичок", "1–5 ур.", "монеты, кинжал, наруч"),
             ("Продвинутый", "6–10 ур.", "слиток, шлем, зелье опыта"),
             ("Профи", "11–15 ур.", "золото, меч, кираса")]
    y = 176
    for name, rng, rew in tiers:
        rr(d, [58, y, W - 58, y + 122], outline=(96, 84, 52))
        d.rectangle([58, y, 66, y + 122], fill=GOLD)
        d.text((96, y + 30), name, font=f(FB, 32), fill=WHITE)
        d.text((96, y + 74), rng, font=f(FR, 23), fill=GOLD)
        d.text((420, y + 48), rew, font=f(FR, 24), fill=MUTED)
        y += 140
    d.text((58, 606), "Награда — сразу при переходе. Задним числом не выдаётся.",
           font=f(FR, 21), fill=MUTED)
    img.save(path)


for n, fn in [("dr-1.png", sections), ("dr-2.png", races),
              ("dr-3.png", ai), ("dr-4.png", passs)]:
    fn(n); print("готово:", n)
