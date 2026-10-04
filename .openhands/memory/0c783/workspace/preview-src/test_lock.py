"""Проверка: закрывается ли окно пароля крестиком, «Отменой» и Escape."""
import json, re, subprocess, time, urllib.request

DS = "/tmp/ds"
PORT = 8765
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
  const rep = () => ({
    overlay: document.getElementById('lockOverlay').classList.contains('open'),
    editable: document.getElementById('dbody').contentEditable,
    titleDisabled: document.getElementById('dtitle').disabled,
    newDisabled: document.getElementById('newBtn').disabled,
    saveDisabled: document.getElementById('saveBtn').disabled,
    bannerHidden: document.getElementById('lockBanner').hidden,
    closeVisible: getComputedStyle(document.getElementById('lockClose')).display !== 'none',
    cancelVisible: getComputedStyle(document.getElementById('lockCancel')).display !== 'none',
    list: document.getElementById('list').textContent.trim().slice(0, 40)
  });
  const r = {};
  r['1_при_загрузке'] = rep();
  document.getElementById('lockClose').click(); await wait(60);
  r['2_после_крестика'] = rep();
  document.getElementById('unlockBtn').click(); await wait(60);
  document.getElementById('lockCancel').click(); await wait(60);
  r['3_после_отмены'] = rep();
  document.getElementById('unlockBtn').click(); await wait(60);
  document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true})); await wait(60);
  r['4_после_Escape'] = rep();
  r['5_записи_в_списке'] = document.getElementById('list').textContent.trim().slice(0,80);
  const pre = document.createElement('pre');
  pre.textContent = String.fromCharCode(1) + JSON.stringify(r) + String.fromCharCode(2);
  document.body.appendChild(pre);
})();
"""


def run_dom(url, budget=20000):
    out = subprocess.run(
        ["chromium", "--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
         "--window-size=1440,900", f"--virtual-time-budget={budget}", "--dump-dom", url],
        capture_output=True, text=True, timeout=180).stdout
    m = re.search(r"\x01(.*?)\x02", out)
    return json.loads(m.group(1)) if m else None


def main():
    env = subprocess.run(
        ["node", "/workspace/project/preview-src/make_envelope.js", PW, ENTRIES],
        capture_output=True, text=True, timeout=120)
    if env.returncode != 0:
        print("node error:", env.stderr[:400]); return
    envelope = json.loads(env.stdout)
    print("конверт:", envelope["alg"], "| ct:", len(envelope["ct"]), "символов\n")

    src = open(f"{DS}/diary.html", encoding="utf-8").read()
    seed = ("<script>localStorage.setItem('volna.diary.enc',"
            + json.dumps(json.dumps(envelope, ensure_ascii=False))
            + ");localStorage.removeItem('volna.diary.v1');</script>")
    page = src.replace('<script src="diary.js', seed + '\n<script src="diary.js')
    page = page.replace("</body>", "<script>" + PROBE + "</script></body>")
    open(f"{DS}/test-lock.html", "w", encoding="utf-8").write(page)

    srv = subprocess.Popen(["python3", "-m", "http.server", str(PORT)], cwd=DS,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(30):
            try:
                urllib.request.urlopen(BASE + "/test-lock.html", timeout=2).read(); break
            except Exception:
                time.sleep(0.3)
        rep = run_dom(BASE + "/test-lock.html")
    finally:
        srv.terminate()

    if not rep:
        print("ОТЧЁТ НЕ ПОЛУЧЕН"); return
    for k, v in rep.items():
        print(f"--- {k} ---")
        if isinstance(v, dict):
            for kk, vv in v.items():
                print(f"    {kk:14} = {vv}")
        else:
            print("   ", v)
        print()


main()
