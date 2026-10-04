"""Проверка правок «Логоса»: каждая найденная ошибка закрыта."""
import os, re, tempfile

from app import create_app

tmp = tempfile.mkdtemp()
app = create_app({"TESTING": True, "DATABASE": os.path.join(tmp, "t.sqlite3"), "SECRET_KEY": "t"})
c = app.test_client()
ok = []


def check(name, cond):
    ok.append((name, cond))
    print(("  ✓ " if cond else "  ✗ ") + name)


def add(title, body, author="Анна", tags="", summary=""):
    c.post("/new", data={"title": title, "body": body, "author": author,
                         "tags": tags, "summary": summary}, follow_redirects=True)
    return c.get("/api/posts").get_json()[0]["id"]


def page(pid):
    return c.get(f"/post/{pid}").get_data(as_text=True)


def prose(pid):
    return re.search(r'<div class="prose">(.*?)</div>', page(pid), re.S).group(1)


print("=== 1. XSS: сырой HTML больше не исполняется ===")
pid = add("XSS тег", "Текст.\n\n<script>alert('взлом')</script>\n\nЕщё.")
check("script вырезан", "<script>alert('взлом')</script>" not in page(pid))
pid = add("XSS картинка", 'Текст.\n\n<img src=x onerror="alert(1)">\n\nЕщё.')
p = prose(pid)
check("onerror вырезан", "onerror" not in p)
check("обработчик не в теге", not re.search(r"<\w+[^>]*on\w+\s*=", p))

print("\n=== 2. attr_list больше не внедряет атрибуты ===")
pid = add("Attr ссылка", 'Ссылка [клик](https://example.com){onclick="alert(1)"} тут.')
check("onclick не появился", 'onclick="alert(1)"' not in prose(pid))

print("\n=== 3. javascript: в ссылке заблокирован ===")
pid = add("Js ссылка", "Ссылка [жми](javascript:alert(1)) тут.")
check("javascript: не в href", 'href="javascript:' not in prose(pid))

print("\n=== 4. Обычная разметка не сломалась ===")
pid = add("Разметка", "**Жирный** и *курсив* и [ссылка](https://example.com).\n\n- раз\n- два")
p = prose(pid)
check("жирный", "<strong>Жирный</strong>" in p)
check("курсив", "<em>курсив</em>" in p)
check("ссылка", 'href="https://example.com"' in p)
check("список", "<ul>" in p and "<li>раз</li>" in p)

print("\n=== 5. Лимиты длины работают на сервере ===")
r = c.post("/new", data={"title": "Т" * 5000, "body": "Б" * 100000,
                         "author": "А" * 500, "tags": "т" * 500, "summary": "О" * 2000},
           follow_redirects=True)
h = r.get_data(as_text=True)
check("длинный заголовок отклонён", "Заголовок слишком длинный" in h)
check("длинный текст отклонён", "Текст слишком длинный" in h)
check("длинное имя отклонено", "Имя автора слишком длинное" in h)
check("длинное описание отклонено", "Описание слишком длинное" in h)
check("в базе нет гигантских постов",
      not any(len(x["title"]) > 200 for x in c.get("/api/posts").get_json()))

print("\n=== 6. Длинный комментарий отклонён ===")
pid = add("Комм", "Текст для комментариев.")
r = c.post(f"/post/{pid}/comment", data={"author": "А", "body": "К" * 5000},
           follow_redirects=True)
check("комментарий отклонён", "Комментарий слишком длинный" in r.get_data(as_text=True))

print("\n=== 7. Спам реакциями ограничен ===")
pid = add("Реакции", "Текст для реакций.")
for _ in range(260):
    c.post(f"/post/{pid}/react/like")
n = [x for x in c.get("/api/posts").get_json() if x["id"] == pid][0]["reactions"]
check(f"реакций не больше лимита (получено {n})", n <= 200)

print("\n=== 8. Заголовки безопасности ===")
r = c.get("/")
for h in ("Content-Security-Policy", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy"):
    check(f"{h} присутствует", bool(r.headers.get(h)))
check("в CSP есть nonce", "nonce-" in r.headers.get("Content-Security-Policy", ""))
check("скрипт темы помечен nonce", 'script nonce="' in r.get_data(as_text=True))

print("\n=== 9. Новые маршруты ===")
r = c.get("/robots.txt")
check("robots.txt отдаётся", r.status_code == 200 and b"Disallow" in r.data)
check("в robots есть sitemap", b"Sitemap:" in r.data)
r = c.get("/sitemap.xml")
check("sitemap.xml отдаётся", r.status_code == 200 and b"<urlset" in r.data)
check("в sitemap есть посты", b"/post/" in r.data)

print("\n=== 10. Метатеги для соцсетей ===")
pid = add("Соцсети", "Текст про соцсети достаточно длинный.")
h = page(pid)
check("og:title на странице поста", 'property="og:title" content="Соцсети"' in h)
check("og:type=article", 'property="og:type" content="article"' in h)
check("canonical есть", 'rel="canonical"' in h)

print("\n=== 11. Мобильное меню не скрывает разделы ===")
css = open("app/static/css/style.css", encoding="utf-8").read()
check("правило display:none для ссылок убрано",
      ".nav a:not(.btn):not(.icon-link) { display: none; }" not in css)
check("меню переносится на строку", ".nav { flex-wrap: wrap;" in css)

print("\n=== 12. Лента и секретный ключ ===")
r = c.get("/feed.xml")
check("лента отдаётся как application/xml", r.headers["Content-Type"].startswith("application/xml"))
check("ссылка ведёт на свой домен", b"/feed.xml" in r.data)
check("дата в формате RFC 822", re.search(rb"<pubDate>\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} [+-]\d{4}</pubDate>", r.data) is not None)
check("в шаблоне нет стандартного ключа", app.config["SECRET_KEY"] != "logos-dev-secret")

failed = [n for n, p in ok if not p]
print(f"\nИтог: {len(ok) - len(failed)} из {len(ok)} проверок пройдено")
if failed:
    print("НЕ ПРОШЛИ:", failed)
    raise SystemExit(1)
