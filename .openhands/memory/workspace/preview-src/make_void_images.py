from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 675
FB = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BG = (13, 14, 22)
CARD = (24, 26, 40)
BLOOD = (196, 74, 74)
PURPLE = (150, 110, 235)
CYAN = (90, 200, 220)
GOLD = (216, 178, 96)
WHITE = (255, 255, 255)
MUTED = (168, 172, 190)


def f(p, s): return ImageFont.truetype(p, s)


def base(accent):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    for i in range(H):
        d.line([(0, i), (W, i)], fill=tuple(int(BG[k] * (1 - i / H * 0.5)) for k in range(3)))
    d.rectangle([0, 0, 8, H], fill=accent)
    d.ellipse([W - 340, -220, W + 160, 280], outline=accent, width=2)
    d.ellipse([-180, H - 220, 220, H + 180], outline=accent, width=2)
    return img, d


def head(d, text, accent):
    d.text((56, 46), text, font=f(FB, 44), fill=WHITE)
    d.rectangle([56, 114, 176, 120], fill=accent)


def rr(d, box, r=14, fill=CARD, outline=None, w=2):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=w)


def wrap(d, text, font, limit):
    out, line = [], ""
    for w_ in text.split():
        t = (line + " " + w_).strip()
        if d.textlength(t, font=font) < limit: line = t
        else: out.append(line); line = w_
    out.append(line)
    return out


# ---- 1. Как играть ----
def how(path):
    img, d = base(BLOOD)
    head(d, "Как играть", BLOOD)
    rows = [
        ("Удар", "пробел или свайп по монстру"),
        ("Заклинания", "Q / W / E — три школы магии"),
        ("Выбор силы", "на каждом уровне — одна из трёх способностей"),
        ("Путь", "шесть локаций, за каждой — Владыка"),
    ]
    y = 164
    for i, (h, s) in enumerate(rows, 1):
        rr(d, [56, y, W - 56, y + 104], outline=(66, 44, 50))
        d.ellipse([84, y + 32, 138, y + 86], fill=BLOOD)
        n = str(i)
        d.text((111 - d.textlength(n, font=f(FB, 28)) / 2, y + 44), n, font=f(FB, 28), fill=BG)
        d.text((164, y + 24), h, font=f(FB, 31), fill=WHITE)
        d.text((164, y + 64), s, font=f(FR, 23), fill=MUTED)
        y += 120
    img.save(path)


# ---- 2. Шесть локаций ----
def locs(path):
    img, d = base(PURPLE)
    head(d, "Шесть проклятых земель", PURPLE)
    items = [("Ночные Поля", "жатва мёртвых"), ("Тёмный Лес", "шелест и голодные тени"),
             ("Подземелье", "там, где гниёт свет"), ("Мёртвые Горы", "холодные троны"),
             ("Проклятый Собор", "молитвы не услышаны"), ("Бездна", "конец всякой дороги")]
    cw = (W - 148) // 2
    for i, (h, s) in enumerate(items):
        cx = 56 + (i % 2) * (cw + 36)
        cy = 158 + (i // 2) * 132
        rr(d, [cx, cy, cx + cw, cy + 112], outline=(62, 54, 96))
        d.rectangle([cx, cy, cx + 5, cy + 112], fill=PURPLE)
        d.text((cx + 22, cy + 22), h, font=f(FB, 27), fill=WHITE)
        d.text((cx + 22, cy + 60), s, font=f(FR, 20), fill=MUTED)
    img.save(path)


# ---- 3. Древо знаний ----
def tree(path):
    img, d = base(CYAN)
    head(d, "Древо Знаний", CYAN)
    branches = [("Пламя", ["Искра", "Жар", "Внутренний Горн", "Пожар", "Венец Пламени"], BLOOD),
                ("Лёд", ["Иней", "Стужа", "Мёрзлый Родник", "Метель", "Венец Льда"], CYAN),
                ("Молния", ["Разряд", "Ток", "Грозовое Ядро", "Гроза", "Венец Бури"], GOLD)]
    cw = (W - 148) // 3
    for i, (name, nodes, col) in enumerate(branches):
        cx = 56 + i * (cw + 18)
        rr(d, [cx, 152, cx + cw, 600], outline=(50, 62, 74))
        d.text((cx + 24, 172), name, font=f(FB, 31), fill=col)
        yy = 240
        for n in nodes:
            d.text((cx + 24, yy), "•  " + n, font=f(FR, 21), fill=WHITE)
            yy += 62
    d.text((56, 616), "15 узлов в каждой ветке. Открываются по порядку за очки знаний.",
           font=f(FR, 21), fill=MUTED)
    img.save(path)


# ---- 4. Снаряжение и редкости ----
def gear(path):
    img, d = base(GOLD)
    head(d, "Снаряжение и редкости", GOLD)
    rar = [("Обычный", (150, 155, 170)), ("Необычный", (110, 200, 130)),
           ("Редкий", (90, 160, 235)), ("Эпический", (185, 120, 230)),
           ("Легендарный", (235, 175, 80)), ("Проклятый", (200, 90, 90))]
    for i, (name, col) in enumerate(rar):
        cy = 158 + i * 68
        d.rounded_rectangle([56, cy, 560, cy + 54], radius=10, fill=col)
        d.text((78, cy + 12), name, font=f(FB, 26), fill=(18, 18, 26))
    rr(d, [600, 158, W - 56, 568], outline=(96, 84, 52))
    d.text((626, 178), "10 слотов", font=f(FB, 30), fill=GOLD)
    slots = ["Оружие", "Щит", "Шлем", "Нагрудник", "Перчатки",
             "Поножи", "Сапоги", "Плащ", "Амулет", "Кольцо"]
    for i, s in enumerate(slots):
        d.text((626 + (i % 2) * 280, 232 + (i // 2) * 62), "•  " + s, font=f(FR, 22), fill=WHITE)
    img.save(path)


for n, fn in [("vd-1.png", how), ("vd-2.png", locs), ("vd-3.png", tree), ("vd-4.png", gear)]:
    fn(n); print("готово:", n)
