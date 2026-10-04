"""Глубокие проверки «Логоса»: то, что не покрыто test_app.py."""
import os, re, sqlite3, tempfile

from app import create_app

tmp = tempfile.mkdtemp()
app = create_app({"TESTING": True, "DATABASE": os.path.join(tmp, "t.sqlite3"), "SECRET_KEY": "t"})
c = app.test_client()


def add(title, body, author="Анна", tags="", summary=""):
    c.post("/new", data={"title": title, "body": body, "author": author,
                         "tags": tags, "summary": summary}, follow_redirects=True)
    return c.get("/api/posts").get_json()[0]["id"]


def page(pid):
    return c.get(f"/post/{pid}").get_data(as_text=True)


print("=== 1. Сырой HTML в Markdown исполняется ===")
pid = add("XSS тег", "Текст.\n\n<script>alert('взлом')</script>\n\nЕщё.")
print("   <script> в странице:", "<script>alert('взлом')</script>" in page(pid))
pid = add("XSS картинка", 'Текст.\n\n<img src=x onerror="alert(1)">\n\nЕщё.')
print("   <img onerror> в странице:", 'onerror="alert(1)"' in page(pid))

print("\n=== 2. attr_list из 'extra': атрибуты в генерируемые теги ===")
pid = add("Attr ссылка", 'Ссылка [клик](https://example.com){onclick="alert(1)"} тут.')
print("   onclick внедрён:", 'onclick="alert(1)"' in page(pid))

print("\n=== 3. javascript: в ссылке ===")
pid = add("Js ссылка", "Ссылка [жми](javascript:alert(1)) тут.")
print("   javascript: прошёл:", "javascript:alert(1)" in page(pid))

print("\n=== 4. Лимиты длины на сервере (maxlength игнорируется) ===")
pid = add("Т" * 5000, "Б" * 100000, author="А" * 500, tags="т" * 500, summary="О" * 2000)
html = page(pid)
m = re.search(r"<h1>(Т+)</h1>", html)
print("   длина заголовка в базе:", len(m.group(1)) if m else "?")
p = [x for x in c.get("/api/posts").get_json() if x["id"] == pid][0]
print("   автор:", len(p["author"]), "| сводка:", len(p["summary"]), "| теги:", p["tags"])

print("\n=== 5. Один клиент может слать реакции без ограничений ===")
pid = add("Reak", "Текст для реакций.")
for _ in range(30):
    c.post(f"/post/{pid}/react/like")
print("   реакций:", [x for x in c.get("/api/posts").get_json() if x["id"] == pid][0]["reactions"])

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
