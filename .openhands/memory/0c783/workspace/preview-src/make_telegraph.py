import json, urllib.request, urllib.parse

API = "https://api.telegra.ph/"

def post(method, **params):
    data = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(API + method, data=data)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())

# 1) anonymous account (no auth / confirmation needed)
acc = post("createAccount",
           short_name="Сайты на заказ",
           author_name="Сайты на заказ")
print("account:", acc.get("ok"), acc.get("error"))
token = acc["result"]["access_token"]

def h(text):   return {"tag": "h3", "children": [text]}
def p(text):   return {"tag": "p",  "children": [text]}
def b(text):   return {"tag": "b",  "children": [text]}
def li(text):  return {"tag": "li", "children": [text]}
def ol(items): return {"tag": "ol", "children": [li(i) for i in items]}
def hr():      return {"tag": "hr"}

content = [
    p("Здесь два шаблона брифа: короткий — чтобы отправить заказ быстро, и подробный — для больших проектов. Выбирайте любой, заполните и пришлите мне в личку."),

    hr(),
    h("Шаблон №1 — короткий (быстро)"),
    ol([
        "Имя:",
        "Что за сайт: (личный / бизнес / портфолио / магазин / блог / другое)",
        "Чем занимаетесь / о чём сайт:",
        "Какие страницы нужны:",
        "Есть ли тексты и фото: (есть / нет)",
        "Ваши контакты для сайта: (телефон, Telegram, e-mail)",
        "Ссылки на сайты, которые нравятся:",
        "Цвета и стиль:",
        "Сроки:",
        "Ваши пожелания:",
    ]),

    hr(),
    h("Шаблон №2 — подробный (для больших проектов)"),

    h("1. О проекте"),
    ol([
        "Название сайта / проекта:",
        "Тип сайта: (лендинг / визитка / магазин / портфолио / блог / другое)",
        "Цель сайта: (заявки / продажи / запись / показать себя)",
    ]),

    h("2. О вас"),
    ol(["Чем занимаетесь:", "Чем отличаетесь от других:"]),

    h("3. Структура"),
    ol(["Какие разделы нужны:", "Что обязательно должно быть на главной:"]),

    h("4. Контент"),
    ol([
        "Тексты: (есть / написать вам)",
        "Логотип: (есть / нет)",
        "Фото: (есть свои / нужны готовые / нет фото)",
        "Контакты для сайта: (телефон / Telegram / e-mail / адрес)",
    ]),

    h("5. Дизайн"),
    ol([
        "Стиль: (строгий / современный / яркий / минимализм)",
        "Цвета:",
        "Примеры сайтов, которые нравятся:",
    ]),

    h("6. Функции"),
    ol([
        "Что нужно: (форма заявки / кнопки связи / карта / галерея / каталог / другое)",
        "Нужно ли менять текст самому позже: (да / нет)",
    ]),

    h("7. Техническое"),
    ol([
        "Адрес сайта: (есть / нужно подобрать)",
        "Что подключить: (карты / статистика / другое)",
    ]),

    h("8. Сроки"),
    ol(["Когда нужен сайт:"]),

    hr(),
    p("Если что-то не понятно — пишите, подскажу и помогу заполнить."),
]

page = post("createPage",
            access_token=token,
            title="Бриф на сайт — шаблоны для заполнения",
            author_name="Сайты на заказ",
            content=json.dumps(content, ensure_ascii=False),
            return_content="false")
print("page ok:", page.get("ok"), page.get("error"))
if page.get("ok"):
    print("URL:", page["result"]["url"])
    print("PATH:", page["result"]["path"])
    with open("/workspace/project/telegraph-url.txt", "w") as f:
        f.write(page["result"]["url"] + "\n")
    with open("/workspace/project/preview-src/.telegraph-token", "w") as f:
        f.write(token + "\n")
        f.write(page["result"]["path"] + "\n")
