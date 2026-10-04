"""Снимок незашифрованного дневника: виден ли пустой баннер с кнопкой «Разблокировать»."""
import subprocess, time, urllib.request

DS = "/workspace/project/.work"
PORT = 8768
BASE = f"http://localhost:{PORT}"

srv = subprocess.Popen(["python3", "-m", "http.server", str(PORT)], cwd=DS,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(30):
        try:
            urllib.request.urlopen(BASE + "/diary.html", timeout=2).read(); break
        except Exception:
            time.sleep(0.3)
    for w, h, tag in [(1440, 1000, "desktop"), (390, 900, "mobile")]:
        subprocess.run(["chromium", "--headless", "--no-sandbox", "--disable-gpu",
                        "--hide-scrollbars", "--virtual-time-budget=9000",
                        f"--window-size={w},{h}",
                        f"--screenshot=/workspace/project/.work/plain-{tag}.png",
                        BASE + "/diary.html"], capture_output=True, timeout=180)
finally:
    srv.terminate()

from PIL import Image
for tag in ["desktop", "mobile"]:
    im = Image.open(f"/workspace/project/.work/plain-{tag}.png").convert("RGB")
    print(f"{tag}: {im.size} — снимок готов")
