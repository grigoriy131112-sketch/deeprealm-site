"""Проверяет: (1) перебивает ли CSS атрибут hidden, (2) закрывается ли окно пароля."""
import json, re, subprocess, time, urllib.request

DS = "/workspace/project/.work"
PORT = 8767
BASE = f"http://localhost:{PORT}"
PW = "test1234"
ENTRIES = json.dumps(
    [{"id": "e1", "title": "Секрет", "body": "<p>тайное содержимое</p>",
      "created": 1759000000000, "updated": 1759000000000}],
    ensure_ascii=False)

PROBE = r"""
(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  await wait(500);
  const vis = id => {
    const el = document.getElementById(id);
    const cs = getComputedStyle(el);
    return cs.display + (el.hidden ? ' [hidden]' : ' [без hidden]');
  };
  const r = {
    'lockBanner_display': vis('lockBanner'),
    'moodLink_display': vis('moodLink'),
    'passRow2_display': vis('passRow2'),
    'overlay_open': document.getElementById('lockOverlay').classList.contains('open'),
    'banner_текст': document.getElementById('lockBannerText').textContent.trim().slice(0,50)
  };
  const pre = document.createElement('pre');
  pre.textContent = String.fromCharCode(1) + JSON.stringify(r) + String.fromCharCode(2);
  document.body.appendChild(pre);
})();
"""

PROBE_PLAIN = PROBE


def run_dom(url, budget=15000):
    out = subprocess.run(
        ["chromium", "--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
         "--window-size=1440,900", f"--virtual-time-budget={budget}", "--dump-dom", url],
        capture_output=True, text=True, timeout=180).stdout
    m = re.search(r"\x01(.*?)\x02", out)
    return json.loads(m.group(1)) if m else None


def serve_and_run(page_name):
    srv = subprocess.Popen(["python3", "-m", "http.server", str(PORT)], cwd=DS,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(30):
            try:
                urllib.request.urlopen(f"{BASE}/{page_name}", timeout=2).read(); break
            except Exception:
                time.sleep(0.3)
        return run_dom(f"{BASE}/{page_name}")
    finally:
        srv.terminate()


src = open(f"{DS}/diary.html", encoding="utf-8").read()

# случай А: дневник НЕ зашифрован
open(f"{DS}/t-plain.html", "w", encoding="utf-8").write(
    src.replace("</body>", "<script>" + PROBE_PLAIN + "</script></body>"))

# случай Б: дневник зашифрован
env = subprocess.run(["node", "/workspace/project/preview-src/make_envelope.js", PW, ENTRIES],
                     capture_output=True, text=True, timeout=120)
envelope = json.loads(env.stdout)
seed = ("<script>localStorage.setItem('volna.diary.enc',"
        + json.dumps(json.dumps(envelope, ensure_ascii=False)) + ");</script>")
open(f"{DS}/t-enc.html", "w", encoding="utf-8").write(
    src.replace('<script src="diary.js', seed + '\n<script src="diary.js')
       .replace("</body>", "<script>" + PROBE_PLAIN + "</script></body>"))

print("=== А. дневник НЕ зашифрован (баннера быть не должно) ===")
for k, v in (serve_and_run("t-plain.html") or {}).items():
    print(f"    {k:22} = {v}")

print("\n=== Б. дневник ЗАШИФРОВАН (баннер нужен, окно открыто) ===")
for k, v in (serve_and_run("t-enc.html") or {}).items():
    print(f"    {k:22} = {v}")
