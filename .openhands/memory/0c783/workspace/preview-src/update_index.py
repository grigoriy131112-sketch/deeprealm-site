import json, urllib.request, urllib.parse

API = "https://api.telegra.ph/"
token = open("/workspace/project/preview-src/.telegraph-token").read().splitlines()[0].strip()
PATH = "VebFabrika--stati-i-zakaz-sajtov-09-27"

def post(method, **params):
    data = urllib.parse.urlencode(params).encode()
    with urllib.request.urlopen(urllib.request.Request(API + method, data=data), timeout=60) as r:
        return json.loads(r.read().decode())

def p(t):  return {"tag": "p", "children": t if isinstance(t, list) else [t]}
def b(t):  return {"tag": "b", "children": [t]}
def h3(t): return {"tag": "h3", "children": [t]}
def li(t): return {"tag": "li", "children": t if isinstance(t, list) else [t]}
def ul(items): return {"tag": "ul", "children": [li(i) for i in items]}
def a(text, href): return {"tag": "a", "attrs": {"href": href}, "children": [text]}

CH = "https://t.me/vebfabric"
BR = "https://telegra.ph/Brif-na-sajt--shablony-dlya-zapolneniya-09-27-2"
NEW = "https://telegra.ph/Deeprealm-sajt-dlya-tyomnogo-fehntezi-RP--vse-funkcii-razborom-09-27"
OLD = "https://telegra.ph/Kak-zakazat-sajt-i-ne-pozhalet-chestnyj-razbor-ot-razrabotchika-09-27"
VOID = "https://telegra.ph/Pozhiratel-Pustoty--brauzernaya-igra-sobrannaya-s-nulya-09-30"
ARTS = [
    ("Как заказать сайт и не пожалеть — честный разбор", OLD),
    ("«Логос» — блог для мыслей и публикаций (кратко)",
     "https://telegra.ph/Logos--blog-dlya-myslej-i-publikacij-kratko-10-03"),
    ("«Логос» — как устроен блог, который не платит за хостинг",
     "https://telegra.ph/Logos--blog-gde-mysl-nahodit-formu-10-02"),
    ("Волна — дневник настроения без отправки данных",
     "https://telegra.ph/Volna--dnevnik-nastroeniya-kotoryj-ne-otpravlyaet-vashi-zapisi-nikuda-10-01"),
    ("Deeprealm — сайт для тёмного фэнтези-РП, разбор функций", NEW),
    ("Пожиратель Пустоты — браузерная игра с нуля", VOID),
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
        "Сайты для сообществ — разделы, анкеты, ИИ-помощники",
    ]),
    h3("Как заказать"),
    p("Заполните короткий бриф на 10 вопросов и напишите мне. Обсудим детали и сроки."),
    p([b("Канал: "), a("ВебФабрика", CH)]),
    p([b("Бриф: "), a("заполнить за 2 минуты", BR)]),
]

r = post("editPage", access_token=token, path=PATH,
         title="ВебФабрика — статьи и заказ сайтов",
         author_name="ВебФабрика",
         content=json.dumps(content, ensure_ascii=False),
         return_content="false")
print(json.dumps(r, ensure_ascii=False))
