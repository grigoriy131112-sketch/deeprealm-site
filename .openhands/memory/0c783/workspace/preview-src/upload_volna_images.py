"""Заливает картинки статьи про «Волну» в docs/img/ репозитория."""
import base64, json, os, urllib.request, urllib.error

TOKEN = os.environ["GITHUB_TOKEN"]
REPO = "grigoriy131112-sketch/deeprealm-site"
API = "https://api.github.com"
BASE = "/workspace/project"
FILES = ["volna-1.png", "volna-2.png", "volna-3.png", "volna-4.png"]


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


sha = req("GET", f"{API}/repos/{REPO}/git/ref/heads/main")["object"]["sha"]
base_tree = req("GET", f"{API}/repos/{REPO}/git/commits/{sha}")["tree"]["sha"]

tree = []
for name in FILES:
    with open(os.path.join(BASE, name), "rb") as fh:
        content = base64.b64encode(fh.read()).decode()
    blob = req("POST", f"{API}/repos/{REPO}/git/blobs",
               {"content": content, "encoding": "base64"})
    if "_error" in blob:
        raise SystemExit(f"blob {name}: {blob}")
    tree.append({"path": f"docs/img/{name}", "mode": "100644",
                 "type": "blob", "sha": blob["sha"]})
    print(f"  blob docs/img/{name}")

new_tree = req("POST", f"{API}/repos/{REPO}/git/trees",
               {"base_tree": base_tree, "tree": tree})
commit = req("POST", f"{API}/repos/{REPO}/git/commits",
             {"message": "Add Volna article images", "tree": new_tree["sha"],
              "parents": [sha]})
upd = req("PATCH", f"{API}/repos/{REPO}/git/refs/heads/main",
          {"sha": commit["sha"]})
print("коммит:", commit["sha"][:12])
