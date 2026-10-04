"""Заливает сайт «Волна» в docs/volna/ репозитория deeprealm-site."""
import base64, json, os, urllib.request, urllib.error

TOKEN = os.environ["GITHUB_TOKEN"]
REPO = "grigoriy131112-sketch/deeprealm-site"
API = "https://api.github.com"
SRC = "/tmp/diary-site"
DEST = "docs/volna"

FILES = [
    "index.html", "diary.html", "styles.css", "app.js", "diary.js",
    "data.js", "crypto.js", "pwa.js", "sw.js", "icon.svg",
    "manifest.webmanifest",
]


def req(method, url, payload=None):
    data = json.dumps(payload).encode() if payload else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Authorization", "Bearer " + TOKEN)
    r.add_header("Accept", "application/vnd.github+json")
    if data:
        r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r, timeout=90) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return {"_error": e.code, "_body": e.read().decode()[:300]}


ref = req("GET", f"{API}/repos/{REPO}/git/ref/heads/main")
sha = ref["object"]["sha"]
base_tree = req("GET", f"{API}/repos/{REPO}/git/commits/{sha}")["tree"]["sha"]

tree = []
for name in FILES:
    path = os.path.join(SRC, name)
    with open(path, "rb") as fh:
        content = base64.b64encode(fh.read()).decode()
    blob = req("POST", f"{API}/repos/{REPO}/git/blobs",
               {"content": content, "encoding": "base64"})
    if "_error" in blob:
        raise SystemExit(f"blob {name}: {blob}")
    tree.append({"path": f"{DEST}/{name}", "mode": "100644",
                 "type": "blob", "sha": blob["sha"]})
    print(f"  blob {DEST}/{name}")

new_tree = req("POST", f"{API}/repos/{REPO}/git/trees",
               {"base_tree": base_tree, "tree": tree})
if "_error" in new_tree:
    raise SystemExit(f"tree: {new_tree}")

commit = req("POST", f"{API}/repos/{REPO}/git/commits",
             {"message": "Add Volna mood diary as static site under docs/volna",
              "tree": new_tree["sha"], "parents": [sha]})
if "_error" in commit:
    raise SystemExit(f"commit: {commit}")

upd = req("PATCH", f"{API}/repos/{REPO}/git/refs/heads/main",
          {"sha": commit["sha"]})
if "_error" in upd:
    raise SystemExit(f"ref: {upd}")

print("коммит:", commit["sha"][:12])
