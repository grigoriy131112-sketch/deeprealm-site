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
    d.rectangle([0, 0, W, 7], fill=MINT)
    return img, d


def head(d, title, kicker):
    d.text((64, 52), kicker, font=f(FB, 22), fill=MINT_D)
    d.text((64, 84), title, font=f(FB, 52), fill=INK)
    d.rectangle([64, 158, 184, 164], fill=MINT)


def rr(d, box, r=16, fill=CARD, outline=SAND, w=2):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=w)


img, d = base()
head(d, "Аналитика и достижения", "страница настроения")

# график динамики
rr(d, [64, 200, 700, 470])
d.text((92, 222), "Динамика настроения", font=f(FB, 26), fill=INK)
d.text((92, 256), "30 или 90 дней", font=f(FR, 20), fill=MUTED)
pts = [(92, 420), (168, 400), (244, 372), (320, 384), (396, 340), (472, 300), (548, 318), (624, 268), (664, 250)]
d.line(pts, fill=MINT, width=5, joint="curve")
for px, py in pts:
    d.ellipse([px - 7, py - 7, px + 7, py + 7], fill=CARD, outline=MINT, width=4)

# распределение
rr(d, [732, 200, W - 64, 470])
d.text((760, 222), "Распределение", font=f(FB, 26), fill=INK)
d.text((760, 256), "сколько дней в каждой зоне", font=f(FR, 20), fill=MUTED)
bars = [("Ужасно", 18), ("Плохо", 34), ("Норм", 72), ("Хорошо", 96), ("Отлично", 48)]
by = 300
for name, val in bars:
    d.text((760, by + 4), name, font=f(FR, 19), fill=MUTED)
    d.rounded_rectangle([860, by + 6, 860 + int(val * 2.6), by + 22], radius=8, fill=MINT)
    by += 32

# достижения
rr(d, [64, 492, W - 64, 640])
d.text((92, 512), "Достижения — 8 штук", font=f(FB, 26), fill=INK)
ach = ["Первый шаг", "Неделя подряд", "Месяц подряд", "Дневниковед",
       "Летописец", "Писатель", "На подъёме", "Разнообразие"]
ax = 92
for name in ach:
    tw = d.textlength(name, font=f(FR, 17))
    d.rounded_rectangle([ax, 560, ax + tw + 32, 604], radius=14, fill=(238, 248, 243), outline=MINT, width=2)
    d.text((ax + 16, 573), name, font=f(FR, 17), fill=MINT_D)
    ax += tw + 44
    if ax > W - 220:
        ax = 92

img.save("/workspace/project/volna-5.png")
print("готово: volna-5.png")
