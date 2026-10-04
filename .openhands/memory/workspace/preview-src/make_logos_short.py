"""Публикует короткую статью про сайт «Логос»: что это, что умеет, ссылка."""
import json
import urllib.parse
import urllib.request

API = "https://api.telegra.ph/"
TOKEN = open("/workspace/project/preview-src/.telegraph-token").read().splitlines()[0].strip()
PATH = "Logos--blog-dlya-myslej-i-publikacij-kratko-10-03"
SITE = "https://grigoriy131112-sketch.github.io/logos/"
CH = "https://t.me/vebfabric"
BRIEF = "https://telegra.ph/Brif-na-sajt--shablony-dlya-zapolneniya-09-27-2"
FEED = SITE + "feed.xml"
IMG = "https://grigoriy131112-sketch.github.io/logos/static/img/"
I1, I2, I3, I4, I5 = (IMG + f"logos-{i}.png" for i in range(1, 6))


def post(method, **params):
    data = urllib.parse.urlencode(params).encode()
    with urllib.request.urlopen(urllib.request.Request(API + method, data=data), timeout=90) as r:
        return json.loads(r.read().decode())


def n(tag, children):
    return {"tag": tag, "children": children}


def img(src, caption=None):
    fig = {"tag": "figure", "children": [{"tag": "img", "attrs": {"src": src}}]}
    if caption:
        fig["children"].append({"tag": "figcaption", "children": [caption]})
    return fig


def p(t):
    return n("p", t if isinstance(t, list) else [t])


def b(t):
    return n("b", [t])


def h3(t):
    return n("h3", [t])


def li(t):
    return n("li", [t])


def ul(items):
    return n("ul", [li(x) for x in items])


def a(text, href):
    return {"tag": "a", "attrs": {"href": href}, "children": [text]}


content = [
    img(I1, "«Логос» — блог для мыслей и публикаций"),
    p([b("«Логос»"), " — блог, где автор публикует тексты, а читатели их находят, читают и обсуждают. Небольшой, аккуратный, работает без единого рубля на хостинг."]),
    p([b("Открыть сайт: "), a("«Логос» — блог для мыслей и публикаций", SITE)]),

    h3("Что это"),
    p("Блог в классическом смысле: лента публикаций, страницы авторов, темы. Ничего лишнего — только текст и то, что помогает его читать."),
    img(I2, "Лента публикаций и что есть на сайте"),

    h3("Что умеет"),
    ul([
        "публикации с разметкой — заголовки, списки, ссылки, цитаты;",
        "лента с описанием, датой и временем чтения;",
        "поиск по заголовку и тексту, с учётом кириллицы;",
        "темы (теги) и облако тем: клик по теме — все тексты о ней;",
        "страницы авторов и подборка публикаций каждого;",
        "тёмная и светлая темы с запоминанием выбора;",
        "реакции, полоса прогресса чтения, «Случайная мысль»;",
        "отклики под публикациями — через GitHub Discussions, регистрация на сайте не нужна;",
        "RSS-лента и карта сайта — для поисковиков и читалок;",
        "«Мастерская»: личное место читателя без регистрации, записи хранятся в браузере.",
    ]),
    img(I3, "Шесть главных возможностей"),

    h3("Из чего сделан"),
    p("Python, Flask, SQLite, Markdown, чистый CSS и JavaScript. Без сборщиков и платных сервисов. Хостинг — GitHub Pages: бесплатно и надёжно."),
    p([b("Особенность: "), "на GitHub Pages нет сервера, поэтому обычные комментарии там не работают. Их заменили отклики на GitHub Discussions — обсуждение под каждой публикацией своё, а отклики видит весь мир."]),
    img(I4, "Из чего собран сайт"),

    h3("Ссылки"),
    img(I5, "Как открыть и куда заглянуть"),
    p([b("Сайт: "), a("«Логос» — блог для мыслей и публикаций", SITE)]),
    p([b("Лента RSS: "), a("подписаться", FEED)]),
    p([b("О блоге: "), a("как он устроен", SITE + "about/")]),
    p([b("Хотите такой же: "), a("заполните бриф за 2 минуты", BRIEF)]),
    p([b("Мой канал: "), a("ВебФабрика", CH)]),

    p("— Материал подготовлен AI-агентом OpenHands от имени канала «ВебФабрика»."),
]

r = post("editPage", access_token=TOKEN, path=PATH,
         title="«Логос» — блог для мыслей и публикаций (кратко)",
         author_name="Сайты на заказ",
         content=json.dumps(content, ensure_ascii=False),
         return_content="false")
if r.get("ok"):
    print("URL:", r["result"]["url"])
else:
    print("ОШИБКА:", json.dumps(r, ensure_ascii=False))
