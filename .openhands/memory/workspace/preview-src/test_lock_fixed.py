"""Проверка после правок: hidden работает, окно пароля не закрывается."""
import json, re, subprocess, time, urllib.request

DS = "/workspace/project/.work"
PORT = 8769
BASE = f"http://localhost:{PORT}"
PW = "test1234"
ENTRIES = json.dumps(
    [{"id": "e1", "title": "Секрет", "body": "<p>тайное содержимое</p>",
      "created": 1759000000000, "updated": 1759000000000}],
    ensure_ascii=False)

PROBE = r"""
(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  await wait(600);
  const disp = id => getComputedStyle(document.getElementById(id)).display;
  const open = () => document.getElementById('lockOverlay').classList.contains('open');
  const r = {};

  r['hidden_баннер'] = disp('lockBanner');
  r['hidden_пометка_настроения'] = disp('moodLink');

  if (document.getElementById('lockOverlay').classList.contains('open')) {
    r['1_окно_открыто'] = open();
    r['1_крестик_виден'] = disp('lockClose') !== 'none';
    r['1_отмена_видна'] = disp('lockCancel') !== 'none';

    document.getElementById('lockClose').click(); await wait(80);
    r['2_крестик_закрыл'] = open();
    document.getElementById('lockCancel').click(); await wait(80);
    r['3_отмена_закрыла'] = open();
    document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}));
    await wait(80);
    r['4_Escape_закрыл'] = open();

    document.getElementById('passInput').value = 'неверный';
    document.getElementById('lockOk').click(); await wait(2500);
    r['5_после_неверного_пароля'] = open();
    r['5_сообщение'] = document.getElementById('lockMsg').textContent.trim().slice(0,45);

    document.getElementById('passInput').value = '__PW__';
    document.getElementById('lockOk').click(); await wait(3000);
    r['6_после_верного_пароля'] = open();
    r['6_редактор'] = document.getElementById('dbody').contentEditable;
    r['6_записи'] = document.getElementById('list').textContent.trim().slice(0,60);
    r['6_баннер_скрыт'] = disp('lockBanner');
  } else {
    r['1_окно_закрыто'] = true;
  }
  const pre = document.createElement('pre');
  pre.textContent = String.fromCharCode(1) + JSON.stringify(r) + String.fromCharCode(2);
  document.body.appendChild(pre);
})();
""".replace("__PW__", PW)


def run_dom(url, budget=30000):
    out = subprocess.run(
        ["chromium", "--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
         "--window-size=1440,900", f"--virtual-time-budget={budget}", "--dump-dom", url],
        capture_output=True, text=True, timeout=200).stdout
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
open(f"{DS}/t-plain2.html", "w", encoding="utf-8").write(
    src.replace("</body>", "<script>" + PROBE + "</script></body>"))

env = subprocess.run(["node", "/workspace/project/preview-src/make_envelope.js", PW, ENTRIES],
                     capture_output=True, text=True, timeout=120)
envelope = json.loads(env.stdout)
seed = ("<script>localStorage.setItem('volna.diary.enc',"
        + json.dumps(json.dumps(envelope, ensure_ascii=False)) + ");</script>")
open(f"{DS}/t-enc2.html", "w", encoding="utf-8").write(
    src.replace('<script src="diary.js', seed + '\n<script src="diary.js')
       .replace("</body>", "<script>" + PROBE + "</script></body>"))

print("=== А. дневник НЕ зашифрован ===")
for k, v in (serve_and_run("t-plain2.html") or {}).items():
    print(f"    {k:28} = {v}")

print("\n=== Б. дневник ЗАШИФРОВАН ===")
for k, v in (serve_and_run("t-enc2.html") or {}).items():
    print(f"    {k:28} = {v}")
