import json, urllib.request, urllib.parse

API = "https://api.telegra.ph/"
token = open("/workspace/project/preview-src/.telegraph-token").read().splitlines()[0].strip()

def post(method, **params):
    data = urllib.parse.urlencode(params).encode()
    with urllib.request.urlopen(urllib.request.Request(API + method, data=data), timeout=60) as r:
        return json.loads(r.read().decode())

MAP = {
    # Deeprealm
    "https://iili.io/n5bmkWG.png": "https://kappa.lol/mYrqTB",
    "https://iili.io/n5bmvsf.png": "https://kappa.lol/y3kePj",
    "https://iili.io/n5bmU0l.png": "https://kappa.lol/SBaIfz",
    "https://iili.io/n5bm4JS.png": "https://kappa.lol/cgpOju",
    # Первая статья
    "https://iili.io/n5bTryF.png": "https://kappa.lol/qIU5uz",
    "https://iili.io/n5bTiZJ.png": "https://kappa.lol/NqUezv",
    "https://iili.io/n5bTQGR.png": "https://kappa.lol/rBFOkB",
    "https://iili.io/n5bTD3N.png": "https://kappa.lol/BG4IcS",
}

PAGES = [
    "Deeprealm-sajt-dlya-tyomnogo-fehntezi-RP--vse-funkcii-razborom-09-27",
    "Kak-zakazat-sajt-i-ne-pozhalet-chestnyj-razbor-ot-razrabotchika-09-27",
]

def fix(nodes):
    n = 0
    if isinstance(nodes, list):
        for x in nodes: n += fix(x)
    elif isinstance(nodes, dict):
        if nodes.get("tag") == "img":
            src = nodes.get("attrs", {}).get("src", "")
            if src in MAP:
                nodes["attrs"]["src"] = MAP[src]
                n += 1
        for v in nodes.values(): n += fix(v)
    return n

for path in PAGES:
    r = post("getPage", path=path, return_content="true")
    page = r["result"]
    nodes = page["content"]
    if isinstance(nodes, str):
        nodes = json.loads(nodes)
    replaced = fix(nodes)
    e = post("editPage", access_token=token, path=path,
             title=page["title"], author_name=page.get("author_name") or "ВебФабрика",
             content=json.dumps(nodes, ensure_ascii=False), return_content="false")
    print(f'{path}: заменено {replaced}, ok={e.get("ok")}')
