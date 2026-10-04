"""Сборка статической версии «Логоса» для GitHub Pages.

Pages отдаёт только готовые файлы, поэтому страницы рендерим заранее самим
приложением — так вид и содержимое совпадают с живым сайтом. Ссылки
переписываем под адрес проекта (подкаталог /logos/), а серверные формы
заменяем: без сервера их не обслужить.
"""
import os
import re
import shutil
import sqlite3
import sys
from urllib.parse import quote, unquote

from bs4 import BeautifulSoup

REPO = "/workspace/project/.logos-deploy"
DOCS = os.path.join(REPO, "docs")
DB = "/workspace/project/.logos-build/logos.sqlite3"
HOST = "https://grigoriy131112-sketch.github.io"
PREFIX = "/logos"

sys.path.insert(0, REPO)
from app import create_app  # noqa: E402
from app import db as blog_db  # noqa: E402

TRANS = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}


def slugify(text):
    parts = []
    for ch in (text or "").lower():
        if ch in TRANS:
            parts.append(TRANS[ch])
        elif ch.isascii() and ch.isalnum():
            parts.append(ch)
        else:
            parts.append("-")
    return re.sub(r"-+", "-", "".join(parts)).strip("-") or "x"


conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row
posts = conn.execute("SELECT * FROM posts ORDER BY created_at DESC, id DESC").fetchall()
tag_names = []
for row in conn.execute("SELECT tags FROM posts"):
    for tag in blog_db.parse_tags(row["tags"]):
        if tag not in tag_names:
            tag_names.append(tag)
author_names = [r["author"] for r in conn.execute("SELECT DISTINCT author FROM posts")]
tag_slugs = {t: slugify(t) for t in tag_names}
author_slugs = {a: slugify(a) for a in author_names}
post_ids = {p["id"] for p in posts}

app = create_app({"DATABASE": DB, "SECRET_KEY": "static-build", "TESTING": True})
client = app.test_client()
ENV = {"SCRIPT_NAME": PREFIX}


def render(path, allow_404=False, **kwargs):
    resp = client.get(path, base_url=HOST, environ_overrides=ENV, **kwargs)
    ok = resp.status_code == 200 or (allow_404 and resp.status_code == 404)
    if not ok:
        raise SystemExit(f"не отдалась страница {path}: {resp.status_code}")
    return resp.get_data(as_text=True)


def fix_links(html, random_posts, page_url):
    """Переписать ссылки приложения под статический адрес в подкаталоге."""

    def repl(match):
        href = match.group(1)
        m = re.match(rf"^{PREFIX}/\?tag=([^&]+)$", href)
        if m:
            return f'href="{PREFIX}/tag/{tag_slugs[unquote(m.group(1))]}/"'
        m = re.match(rf"^{PREFIX}/post/(\d+)$", href)
        if m:
            return f'href="{PREFIX}/post/{m.group(1)}/"'
        m = re.match(rf"^{PREFIX}/author/(.+)$", href)
        if m:
            slug = author_slugs.get(unquote(m.group(1)))
            if slug:
                return f'href="{PREFIX}/author/{slug}/"'
        if href == f"{PREFIX}/random":
            data = ",".join(random_posts)
            return f'href="#random" id="random-link" data-posts="{data}"'
        if href in (f"{PREFIX}/authors", f"{PREFIX}/about", f"{PREFIX}/new"):
            return f'href="{href}/"'
        return match.group(0)

    html = re.sub(r'href="([^"]*)"', repl, html)
    # canonical и og:url у приложения указывают на адрес запроса (с ?tag=…).
    # У статической страницы адрес один, поэтому подставляем его. Порядок
    # атрибутов в <meta> может быть любым, поэтому заменяем по содержимому.
    html = re.sub(r'(rel="canonical"[^>]*href=")[^"]*(")', rf"\g<1>{page_url}\g<2>", html)
    html = re.sub(r'(href=")[^"]*("[^>]*rel="canonical")', rf"\g<1>{page_url}\g<2>", html)
    html = re.sub(r'(property="og:url"[^>]*content=")[^"]*(")', rf"\g<1>{page_url}\g<2>", html)
    html = re.sub(r'(content=")[^"]*("[^>]*property="og:url")', rf"\g<1>{page_url}\g<2>", html)
    return html.replace(
        "</body>",
        f'  <script src="{PREFIX}/static/js/static.js"></script>\n</body>')


def strip_server_forms(html):
    """Убрать формы, которым нужен сервер, и оставить понятный след.

    Реакции становятся обычными счётчиками: выглядит законченно и не
    обещает того, чего статика не может.
    """
    soup = BeautifulSoup(html, "html.parser")

    for form in soup.select(".reactions form"):
        button = form.find("button")
        if button:
            button.attrs.pop("type", None)
            button.name = "span"
            form.replace_with(button)

    comment_form = soup.select_one(".comment-form")
    if comment_form:
        note = soup.new_tag("p")
        note["class"] = "muted static-note"
        note.string = "Отклик можно оставить в версии блога с админкой."
        comment_form.replace_with(note)

    editor = soup.select_one(".editor-form")
    if editor:
        box = soup.new_tag("div")
        box["class"] = "empty"
        para = soup.new_tag("p")
        para.string = ("Публикации добавляет автор блога — так тексты остаются "
                       "вычитанными. Здесь показано, как выглядит форма новой "
                       "записи в полной версии «Логоса».")
        box.append(para)
        editor.replace_with(box)

    return str(soup)


def write(rel_path, text):
    full = os.path.join(DOCS, rel_path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        f.write(text)


shutil.rmtree(DOCS, ignore_errors=True)
os.makedirs(DOCS, exist_ok=True)

post_urls = [f"{PREFIX}/post/{p['id']}/" for p in posts]

print("=== страницы ===")
write("index.html",
      fix_links(strip_server_forms(render("/")), post_urls, HOST + PREFIX + "/"))
print("  index.html")

for post in posts:
    html = render(f"/post/{post['id']}")
    write(f"post/{post['id']}/index.html",
          fix_links(strip_server_forms(html), post_urls,
                    f"{HOST}{PREFIX}/post/{post['id']}/"))
print(f"  post/ — {len(posts)}")

for tag in tag_names:
    html = render("/", query_string={"tag": tag})
    write(f"tag/{tag_slugs[tag]}/index.html",
          fix_links(strip_server_forms(html), post_urls,
                    f"{HOST}{PREFIX}/tag/{tag_slugs[tag]}/"))
print(f"  tag/ — {len(tag_names)}")

for name in author_names:
    html = render("/author/" + quote(name))
    write(f"author/{author_slugs[name]}/index.html",
          fix_links(strip_server_forms(html), post_urls,
                    f"{HOST}{PREFIX}/author/{author_slugs[name]}/"))
print(f"  author/ — {len(author_names)}")

for page in ("authors", "about", "new"):
    html = render(f"/{page}")
    write(f"{page}/index.html",
          fix_links(strip_server_forms(html), post_urls, f"{HOST}{PREFIX}/{page}/"))
print("  authors/, about/, new/")

write("404.html",
      fix_links(strip_server_forms(render("/nonexistent", allow_404=True)), post_urls,
                f"{HOST}{PREFIX}/404.html"))
print("  404.html")

print("=== служебные файлы ===")
write("feed.xml", render("/feed.xml"))
write("feed.xsl", render("/feed.xsl"))
write("robots.txt", render("/robots.txt"))
write("sitemap.xml", render("/sitemap.xml"))
print("  feed.xml, feed.xsl, robots.txt, sitemap.xml")

print("=== статика и служебное ===")
shutil.copytree(os.path.join(REPO, "app", "static"), os.path.join(DOCS, "static"))
write(".nojekyll", "")
print("  static/, .nojekyll")

print("=== проверка ссылок ===")
problems = []
for root, _dirs, files in os.walk(DOCS):
    for name in files:
        if not name.endswith((".html", ".xml")):
            continue
        full = os.path.join(root, name)
        text = open(full, encoding="utf-8").read()
        rel = os.path.relpath(full, DOCS)
        for href in re.findall(r'href="([^"]+)"', text):
            if href.startswith(("http", "#", "data:", "mailto:", "tel:")):
                continue
            if href.startswith("/") and not href.startswith(PREFIX + "/"):
                problems.append(f"{rel}: ссылка мимо проекта — {href}")
            if re.search(r"/post/\d+$", href) or re.search(r"/tag/[^/]+$", href):
                problems.append(f"{rel}: ссылка без завершающего слеша — {href}")
        for pid in re.findall(rf'href="{PREFIX}/post/(\d+)/"', text):
            if int(pid) not in post_ids:
                problems.append(f"{rel}: ссылка на несуществующий пост {pid}")
        if "?tag=" in text:
            problems.append(f"{rel}: осталась ссылка с параметром ?tag=")
        if re.search(r"<form[^>]*action=\"[^\"]*(comment|react)", text):
            problems.append(f"{rel}: осталась серверная форма отклика")

if problems:
    print("  НАЙДЕНЫ ПРОБЛЕМЫ:")
    for p in sorted(set(problems))[:25]:
        print("   -", p)
else:
    print("  ссылки в порядке, серверных форм нет")

files_count = sum(len(f) for _r, _d, f in os.walk(DOCS))
print(f"  всего файлов: {files_count}")
