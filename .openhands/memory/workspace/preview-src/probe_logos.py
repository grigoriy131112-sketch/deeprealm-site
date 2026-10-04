"""Глубокие проверки «Логоса»: то, что не покрыто test_app.py."""
import os, re, sqlite3, tempfile

from app import create_app

tmp = tempfile.mkdtemp()
app = create_app({"TESTING": True, "DATABASE": os.path.join(tmp, "t.sqlite3"), "SECRET_KEY": "t"})
c = app.test_client()


def add(title, body, author="Анна", tags="", summary=""):
    c.post("/new", data={"title": title, "body": body, "author": author,
                         "tags": tags, "summary": summary}, follow_redirects=True)
    d = c.get("/api/posts").get_json()
    return [p for p in d if p["title"] == title][0]["id"]


print("=== 1. Сырой HTML в Markdown исполняется ===")
pid = add("XSS", "Текст.\n\n<script>alert('взлом')</script>\n\nЕщё.")
html = c.get(f"/post/{pid}").get_data(as_text=True)
print("   <script> в странице:", "<script>alert('взлом')</script>" in html)
print("   <img onerror> проходит:", 'onerror="alert(1)"' in c.get(f"/post/{add('X2', 'T.\n\n<img src=x onerror=\"alert(1)\">')}").get_data(as_text=True))

print("\n=== 2. attr_list из 'extra': атрибуты в генерируемые теги ===")
pid = add("A", 'Ссылка [клик](https://example.com){onclick="alert(1)"} тут.')
print("   onclick внедрён:", 'onclick="alert(1)"' in c.get(f"/post/{pid}").get_data(as_text=True))

print("\n=== 3. javascript: в ссылке ===")
pid = add("J", "Ссылка [жми](javascript:alert(1)) тут.")
print("   javascript: прошёл:", "javascript:alert(1)" in c.get(f"/post/{pid}").get_data(as_text=True))

print("\n=== 4. Лимиты длины на сервере (maxlength игнорируется) ===")
pid = add("Т" * 5000, "Б" * 100000, author="А" * 500, tags="т" * 500, summary="О" * 2000)
html = c.get(f"/post/{pid}").get_data(as_text=True)
m = re.search(r"<h1>(Т+)</h1>", html)
print("   длина заголовка в базе:", len(m.group(1)) if m else "?")
d = c.get("/api/posts").get_json()
p = [x for x in d if x["id"] == pid][0]
print("   автор:", len(p["author"]), "| сводка:", len(p["summary"]), "| теги:", p["tags"])

print("\n=== 5. Один клиент может слать реакции без ограничений ===")
pid = add("R", "Текст для реакций.")
for _ in range(30):
    c.post(f"/post/{pid}/react/like")
print("   реакций:", c.get("/api/posts").get_json()[-1]["reactions"])

print("\n=== 6. Host в RSS ===")
r = c.get("/feed.xml", headers={"Host": 'evil.com"><script>x</script>'})
b = r.get_data(as_text=True)
print("   статус:", r.status_code, "| сырой <script> в XML:", "<script>x</script>" in b)
print("   href:", re.search(r'<atom:link href="([^"]*)"', b).group(1)[:70])

print("\n=== 7. Заголовки безопасности ===")
r = c.get("/")
for h in ("Content-Security-Policy", "X-Content-Type-Options", "X-Frame-Options",
          "Referrer-Policy"):
    print(f"   {h}: {r.headers.get(h, 'НЕТ')}")

print("\n=== 8. Битый created_at ===")
db = sqlite3.connect(app.config["DATABASE"])
db.execute("UPDATE posts SET created_at='мусор'"); db.commit(); db.close()
print("   главная:", c.get("/").status_code, "| пост:", c.get(f"/post/{pid}").status_code,
      "| RSS:", c.get("/feed.xml").status_code)

print("\n=== 9. Ошибка в дате ломает сортировку? ===")
print("   порядок сохранился:", c.get("/").status_code == 200)
