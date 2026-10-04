import json, urllib.request, urllib.parse

API = "https://api.telegra.ph/"
token = open("/workspace/project/preview-src/.telegraph-token").read().splitlines()[0].strip()
B = "https://grigoriy131112-sketch.github.io/deeprealm-site/img/"

MAP = {
    "mYrqTB": "dr-1.png", "y3kePj": "dr-2.png", "SBaIfz": "dr-3.png", "cgpOju": "dr-4.png",
    "qIU5uz": "art-1.png", "NqUezv": "art-2.png", "rBFOkB": "art-3.png", "BG4IcS": "art-4.png",
    "NjyeTs": "vd-1.png", "5Fs828": "vd-2.png", "SfpAzv": "vd-3.png", "vPerAE": "vd-4.png",
}
KAPPA = {("https://kappa.lol/" + k): (B + v) for k, v in MAP.items()}

PAGES = [
    "Pozhiratel-Pustoty--brauzernaya-igra-sobrannaya-s-nulya-09-30",
    "Deeprealm-sajt-dlya-tyomnogo-fehntezi-RP--vse-funkcii-razborom-09-27",
    "Kak-zakazat-sajt-i-ne-pozhalet-chestnyj-razbor-ot-razrabotchika-09-27",
]


def post(method, **params):
    data = urllib.parse.urlencode(params).encode()
    with urllib.request.urlopen(urllib.request.Request(API + method, data=data), timeout=60) as r:
        return json.loads(r.read().decode())


def fix(nodes):
    n = 0
    if isinstance(nodes, list):
        for x in nodes:
            n += fix(x)
    elif isinstance(nodes, dict):
        if nodes.get("tag") == "img":
            src = nodes.get("attrs", {}).get("src", "")
            if src in KAPPA:
                nodes["attrs"]["src"] = KAPPA[src]
                n += 1
        for v in nodes.values():
            n += fix(v)
    return n


for path in PAGES:
    page = post("getPage", path=path, return_content="true")["result"]
    nodes = page["content"]
    if isinstance(nodes, str):
        nodes = json.loads(nodes)
    n = fix(nodes)
    e = post("editPage", access_token=token, path=path, title=page["title"],
             author_name=page.get("author_name") or "ВебФабрика",
             content=json.dumps(nodes, ensure_ascii=False), return_content="false")
    print(f'{path}: заменено {n}, ok={e.get("ok")}')
