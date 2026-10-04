import base64, json, os, time, urllib.request, urllib.error

TOKEN = os.environ["GITHUB_TOKEN"]
REPO = "grigoriy131112-sketch/deeprealm-site"
API = "https://api.github.com"
BASE = "/workspace/project"

FILES = sorted(f for f in os.listdir(BASE) if f.endswith(".png"))


def req(method, url, payload=None):
    data = json.dumps(payload).encode() if payload else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Authorization", "Bearer " + TOKEN)
    r.add_header("Accept", "application/vnd.github+json")
    if data:
        r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return {"_error": e.code, "_body": e.read().decode()[:200]}


# текущий HEAD коммита в main
ref = req("GET", f"{API}/repos/{REPO}/git/ref/heads/main")
sha = ref["object"]["sha"]

# базовое дерево
commit = req("GET", f"{API}/repos/{REPO}/git/commits/{sha}")
base_tree = commit["tree"]["sha"]

# blob на каждый файл
tree = []
for name in FILES:
    with open(os.path.join(BASE, name), "rb") as fh:
        content = base64.b64encode(fh.read()).decode()
    blob = req("POST", f"{API}/repos/{REPO}/git/blobs",
               {"content": content, "encoding": "base64"})
    if "_error" in blob:
        print("СБОЙ blob", name, blob)
        continue
    tree.append({"path": "docs/img/" + name, "mode": "100644",
                 "type": "blob", "sha": blob["sha"]})
    print("blob ok:", name)

new_tree = req("POST", f"{API}/repos/{REPO}/git/trees",
               {"base_tree": base_tree, "tree": tree})
if "_error" in new_tree:
    print("СБОЙ tree:", new_tree)
    raise SystemExit(1)

new_commit = req("POST", f"{API}/repos/{REPO}/git/commits",
                 {"message": "Add article images to docs/img", "tree": new_tree["sha"],
                  "parents": [sha]})
if "_error" in new_commit:
    print("СБОЙ commit:", new_commit)
    raise SystemExit(1)

upd = req("PATCH", f"{API}/repos/{REPO}/git/refs/heads/main",
          {"sha": new_commit["sha"], "force": False})
print("коммит:", new_commit["sha"][:12], "| ref обновлён:", "_error" not in upd)
