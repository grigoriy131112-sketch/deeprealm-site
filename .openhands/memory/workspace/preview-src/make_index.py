import json, urllib.request, urllib.parse

API = "https://api.telegra.ph/"
TOKEN_FILE = "/workspace/project/preview-src/.telegraph-token"
token = open(TOKEN_FILE).read().splitlines()[0].strip()

def post(method, **params):
    data = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(API + method, data=data)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())

def p(t):  return {"tag": "p", "children": t if isinstance(t, list) else [t]}
def b(t):  return {"tag": "b", "children": [t]}
def h3(t): return {"tag": "h3", "children": [t]}
def li(t): return {"tag": "li", "children": t if isinstance(t, list) else [t]}
def ul(items): return {"tag": "ul", "children": [li(i) for i in items]}
def a(text, href): return {"tag": "a", "attrs": {"href": href}, "children": [text]}

CH = "https://t.me/vebfabric"
BR = "https://telegra.ph/Brif-na-sajt--shablony-dlya-zapolneniya-09-27-2"
ARTS = [
    ("Кто я и что я делаю", "https://telegra.ph/Kto-ya-i-chto-ya-delayu--kanal-VebFabrika-09-27"),
    ("Зачем вашему делу сайт", "https://telegra.ph/Zachem-vashemu-delu-sajt--kanal-VebFabrika-09-27"),
    ("Ответы на страхи клиентов", "https://telegra.ph/Otvety-na-strahi-klientov--kanal-VebFabrika-09-27"),
    ("Сайт для себя", "https://telegra.ph/Sajt-dlya-sebya--kanal-VebFabrika-09-27"),
]

content = [
    p("Создаю сайты на заказ. Канал «ВебФабрика». Ниже — все статьи про мою работу в одном месте."),
    h3("Статьи"),
    ul([[a(t, u)] for t, u in ARTS]),
    h3("Что я делаю"),
    ul([
        "Лендинги — страница, которая продаёт услугу или товар",
        "Сайты-визитки — для мастеров, кафе, салонов",
        "Портфолио — фотографам, дизайнерам, художникам",
        "Блоги и интернет-магазины",
        "Сайты-приглашения на праздники",
    ]),
    h3("Как заказать"),
    p("Заполните короткий бриф на 10 вопросов и напишите мне. Обсудим детали и сроки."),
    p([b("Канал: "), a("ВебФабрика", CH)]),
    p([b("Бриф: "), a("заполнить за 2 минуты", BR)]),
]

r = post("editPage", access_token=token, path="vebfabrika-vse-stati",
         title="ВебФабрика — статьи и заказ сайтов",
         author_name="ВебФабрика",
         content=json.dumps(content, ensure_ascii=False),
         return_content="false")
print(json.dumps(r, ensure_ascii=False))
print("https://telegra.ph/vebfabrika-vse-stati")
