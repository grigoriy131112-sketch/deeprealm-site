"""Заливает сайт «Волна» в отдельный репозиторий volna (корень)."""
import base64, json, os, urllib.request, urllib.error

TOKEN = os.environ["GITHUB_TOKEN"]
REPO = "grigoriy131112-sketch/volna"
API = "https://api.github.com"
SRC = "/tmp/diary-site"

FILES = [
    "index.html", "diary.html", "styles.css", "app.js", "diary.js",
    "data.js", "crypto.js", "pwa.js", "sw.js", "icon.svg",
    "manifest.webmanifest",
]

README = """# Волна

Дневник настроения и личный дневник. Работает целиком в браузере: данные не уходят
на сервер, регистрация не нужна.

Сайт: https://grigoriy131112-sketch.github.io/volna/

## Страницы

- `index.html` — трекер настроения: отметка дня, календарь, графики, достижения
- `diary.html` — дневник: форматирование, шаблоны, поиск, экспорт

## Приватность

Записи хранятся в localStorage и шифруются паролем (AES-GCM, ключ через PBKDF2).
Пароль нигде не сохраняется.

## Файлы

| Файл | Назначение |
|------|------------|
| `app.js` | логика трекера настроения |
| `diary.js` | логика дневника |
| `data.js` | теги, шаблоны, вопросы дня |
| `crypto.js` | шифрование |
| `pwa.js` | установка на устройство и напоминания |
| `sw.js` | офлайн-кэш |
| `styles.css` | оформление |
| `manifest.webmanifest` | описание приложения |
"""


def req(method, url, payload=None):
    data = json.dumps(payload).encode() if payload else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Authorization", "Bearer " + TOKEN)
    r.add_header("Accept", "application/vnd.github+json")
    if data:
        r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r, timeout=90) as resp:
            body = resp.read().decode()
            return json.loads(body) if body.strip() else {"_ok": resp.status}
    except urllib.error.HTTPError as e:
        return {"_error": e.code, "_body": e.read().decode()[:300]}


# первый файл уже создан вручную — берём sha, чтобы перезаписать
cur = req("GET", f"{API}/repos/{REPO}/contents/README.md")
sha_readme = cur.get("sha")

up = req("PUT", f"{API}/repos/{REPO}/contents/README.md",
         {"message": "Add project README",
          "content": base64.b64encode(README.encode()).decode(),
          **({"sha": sha_readme} if sha_readme else {})})
print("  README:", "ok" if "_error" not in up else up)

for name in FILES:
    with open(os.path.join(SRC, name), "rb") as fh:
        content = base64.b64encode(fh.read()).decode()
    r = req("PUT", f"{API}/repos/{REPO}/contents/{name}",
            {"message": f"Add {name}", "content": content})
    status = "ok" if "_error" not in r else f"ОШИБКА {r['_error']} {r['_body'][:120]}"
    print(f"  {name:24} {status}")

# включаем GitHub Pages из корня ветки main
pages = req("POST", f"{API}/repos/{REPO}/pages",
            {"source": {"branch": "main", "path": "/"}})
print("  Pages:", pages if "_error" in pages else "включён")
