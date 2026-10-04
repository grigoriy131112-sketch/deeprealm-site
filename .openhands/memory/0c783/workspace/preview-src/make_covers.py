from PIL import Image, ImageDraw, ImageFont

W, H = 1280, 720
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_R = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

# (файл, фон, акцент, заголовок строки)
COVERS = [
    ("cover-1.png", (16, 42, 67), (86, 196, 255),
     ["Как заказать сайт", "и не пожалеть"]),
    ("cover-2.png", (48, 22, 62), (255, 138, 186),
     ["Клиент вас нашёл", "и потерял"]),
    ("cover-3.png", (14, 52, 44), (120, 226, 168),
     ["5 страхов", "перед заказом сайта"]),
    ("cover-4.png", (60, 38, 12), (255, 198, 92),
     ["4 идеи", "для личного сайта"]),
]

def draw_cover(path, bg, accent, lines):
    img = Image.new("RGB", (W, H), bg)
    d = ImageDraw.Draw(img)

    for i in range(H):
        t = i / H
        r = int(bg[0] * (1 - t) + bg[0] * 0.35 * t)
        g = int(bg[1] * (1 - t) + bg[1] * 0.35 * t)
        b = int(bg[2] * (1 - t) + bg[2] * 0.35 * t)
        d.line([(0, i), (W, i)], fill=(r, g, b))

    # акцентная полоса слева
    d.rectangle([0, 0, 14, H], fill=accent)

    # круги для оживления фона
    d.ellipse([W - 340, -160, W + 120, 300], outline=accent, width=3)
    d.ellipse([W - 240, H - 260, W + 80, H + 60], outline=accent, width=2)

    f_title = ImageFont.truetype(FONT, 76)
    f_small = ImageFont.truetype(FONT_R, 34)
    f_brand = ImageFont.truetype(FONT, 32)

    y = 210
    for i, line in enumerate(lines):
        color = accent if i == 0 and len(lines) > 1 else (255, 255, 255)
        d.text((70, y), line, font=f_title, fill=color)
        y += 92

    d.text((70, H - 150), "Сайты на заказ — понятно и без технического языка",
           font=f_small, fill=(215, 220, 228))

    # подпись канала
    d.rectangle([70, H - 96, 70 + 20, H - 62], fill=accent)
    d.text((104, H - 96), "ВебФабрика  ·  t.me/vebfabric", font=f_brand, fill=(255, 255, 255))

    img.save(path, "PNG")
    return path

for path, bg, accent, lines in COVERS:
    print("готово:", draw_cover(path, bg, accent, lines))
