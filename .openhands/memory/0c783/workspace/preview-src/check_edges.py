from PIL import Image

for name in ["index-live", "index-mobile"]:
    im = Image.open(f"/tmp/ds/live/{name}.png").convert("RGB")
    W, H = im.size
    px = im.load()

    def isbg(c):
        return abs(c[0] - 251) < 14 and abs(c[1] - 243) < 14 and abs(c[2] - 230) < 16

    left = [y for y in range(H) if any(not isbg(px[x, y]) for x in range(0, 3))]
    right = [y for y in range(H) if any(not isbg(px[x, y]) for x in range(W - 3, W))]
    print(f"{name}: {W}x{H}")
    print(f"  контент у левого края: {len(left)} строк | у правого края: {len(right)} строк")
    if right:
        print(f"  первая строка у правого края: y={right[0]}")
