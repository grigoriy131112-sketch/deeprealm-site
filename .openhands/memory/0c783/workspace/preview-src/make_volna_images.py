from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 675
FB = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

BG = (251, 243, 230)
CARD = (255, 255, 255)
INK = (46, 42, 38)
MUTED = (122, 114, 104)
MINT = (69, 214, 166)
MINT_D = (32, 150, 114)
SAND = (232, 220, 200)


def f(p, s):
    return ImageFont.truetype(p, s)


def base():
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    for i in range(H):
        t = i / H
        d.line([(0, i), (W, i)],
               fill=tuple(int(BG[k] * (1 - t) + (243, 233, 216)[k] * t) for k in range(3)))
    d.ellipse([W - 300, -260, W + 200, 240], fill=(238, 228, 210))
    d.ellipse([-200, H - 200, 200, H + 200], fill=(240, 231, 214))
    d.rectangle([0, 0, W, 7], fill=MINT)
    return img, d


def head(d, title, kicker):
    d.text((64, 52), kicker, font=f(FB, 22), fill=MINT_D)
    d.text((64, 84), title, font=f(FB, 52), fill=INK)
    d.rectangle([64, 158, 184, 164], fill=MINT)


def rr(d, box, r=16, fill=CARD, outline=SAND, w=2):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=w)


def wrap(d, text, font, limit):
    out, line = [], ""
    for word in text.split():
        t = (line + " " + word).strip()
        if d.textlength(t, font=font) < limit:
            line = t
        else:
            out.append(line)
            line = word
    out.append(line)
    return out


def bullets(path, kicker, title, rows):
    img, d = base()
    head(d, title, kicker)
    y = 206
    for n, (h, s) in enumerate(rows, 1):
        rr(d, [64, y, W - 64, y + 106])
        d.ellipse([92, y + 33, 144, y + 85], fill=MINT)
        num = str(n)
        d.text((118 - d.textlength(num, font=f(FB, 28)) / 2, y + 44), num, font=f(FB, 28), fill=CARD)
        d.text((172, y + 24), h, font=f(FB, 31), fill=INK)
        d.text((172, y + 65), s, font=f(FR, 23), fill=MUTED)
        y += 118
    img.save(path)


def grid4(path, kicker, title, cards):
    img, d = base()
    head(d, title, kicker)
    cw, ch, gx, gy = 512, 178, 32, 26
    x0, y0 = 64, 208
    for i, (big, lbl, sub) in enumerate(cards):
        cx = x0 + (i % 2) * (cw + gx)
        cy = y0 + (i // 2) * (ch + gy)
        rr(d, [cx, cy, cx + cw, cy + ch])
        d.rectangle([cx, cy + 18, cx + 6, cy + ch - 18], fill=MINT)
        d.text((cx + 34, cy + 26), big, font=f(FB, 54), fill=MINT_D)
        d.text((cx + 34, cy + 96), lbl, font=f(FB, 26), fill=INK)
        d.text((cx + 34, cy + 132), sub, font=f(FR, 20), fill=MUTED)
    img.save(path)


def moods(path):
    img, d = base()
    head(d, "Отметка настроения", "трекер")
    d.text((64, 200), "Пять уровней, один тап", font=f(FB, 30), fill=INK)
    labels = ["Ужасно", "Плохо", "Норм", "Хорошо", "Отлично"]
    y = 262
    for i, (lvl, name) in enumerate(zip([1, 2, 3, 4, 5], labels)):
        yy = y + i * 62
        rr(d, [64, yy, W - 64, yy + 48], r=12)
        d.text((96, yy + 11), name, font=f(FR, 24), fill=INK)
        barw = int((W - 460) * lvl / 5)
        d.rounded_rectangle([300, yy + 16, 300 + barw, yy + 32], radius=8, fill=MINT)
    d.text((64, 596), "Плюс 12 тегов: сон, спорт, работа, друзья, еда, погода, отдых, отношения, учёба, деньги, здоровье, развлечения",
           font=f(FR, 20), fill=MUTED)
    img.save(path)


bullets(
    "/workspace/project/volna-1.png",
    "обзор",
    "Что такое Волна",
    [
        ("Трекер настроения", "отметка за 10 секунд, календарь и статистика по дням"),
        ("Личный дневник", "записи с форматированием, шаблонами и поиском"),
        ("Всё в браузере", "данные не уходят на сервер, вход и регистрация не нужны"),
        ("Работает офлайн", "устанавливается на телефон как обычное приложение"),
    ],
)

grid4(
    "/workspace/project/volna-2.png",
    "страница настроения",
    "Что умеет трекер",
    [
        ("5", "уровней настроения", "от «ужасно» до «отлично»"),
        ("12", "тегов влияния", "сон, спорт, работа, друзья и другие"),
        ("4", "инсайта", "среднее, серия, лучший и худший день"),
        ("30", "дней в календаре", "видно всю картину месяца"),
    ],
)

bullets(
    "/workspace/project/volna-3.png",
    "страница дневника",
    "Что умеет дневник",
    [
        ("Шесть шаблонов", "утренние страницы, вечерняя рефлексия, разбор тревоги"),
        ("Поиск по записям", "находится всё, что писал раньше"),
        ("Экспорт и импорт", "все записи скачиваются одним файлом JSON"),
        ("Печать и PDF", "дневник можно сохранить на бумаге"),
    ],
)

bullets(
    "/workspace/project/volna-4.png",
    "приватность",
    "Почему это безопасно",
    [
        ("Данные в браузере", "на сервер не уходит ничего, базы данных нет"),
        ("Шифрование паролем", "AES-GCM, ключ выводится через PBKDF2"),
        ("Пароль не хранится", "его знаешь только ты, восстановить нельзя"),
        ("Установка на телефон", "иконка на экране, запуск без браузера"),
    ],
)

print("готово: volna-1..4.png")
