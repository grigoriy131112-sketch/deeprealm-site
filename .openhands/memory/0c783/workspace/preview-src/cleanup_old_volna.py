"""Убирает дубль «Волны» из deeprealm-site (сайт переехал в свой репозиторий)."""
import json, os, urllib.request, urllib.error

TOKEN = os.environ["GITHUB_TOKEN"]
API = "https://api.github.com"
OLD = "grigoriy131112-sketch/deeprealm-site"


def req(method, url, payload=None):
    data = json.dumps(payload).encode() if payload else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Authorization", "Bearer " + TOKEN)
    r.add_header("Accept", "application/vnd.github+json")
    if data:
        r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r, timeout=90) as resp:
            b = resp.read().decode()
            return json.loads(b) if b.strip() else {"_ok": resp.status}
    except urllib.error.HTTPError as e:
        return {"_error": e.code, "_body": e.read().decode()[:200]}


sha = req("GET", f"{API}/repos/{OLD}/git/ref/heads/main")["object"]["sha"]
tree = req("GET", f"{API}/repos/{OLD}/git/commits/{sha}")["tree"]["sha"]

paths = [e["path"] for e in
         req("GET", f"{API}/repos/{OLD}/git/trees/{tree}?recursive=1").get("tree", [])
         if e["type"] == "blob"]

targets = sorted(p for p in paths
                 if p.startswith("docs/volna/") or p.startswith("docs/img/volna-"))
print(f"  файлов к удалению: {len(targets)}")
for p in targets:
    print("   -", p)

if targets:
    nt = req("POST", f"{API}/repos/{OLD}/git/trees",
             {"base_tree": tree,
              "tree": [{"path": p, "mode": "100644", "type": "blob", "sha": None}
                       for p in targets]})
    if "_error" in nt:
        raise SystemExit(f"tree: {nt}")
    c = req("POST", f"{API}/repos/{OLD}/git/commits",
            {"message": "Move Volna to its own repository",
             "tree": nt["sha"], "parents": [sha]})
    if "_error" in c:
        raise SystemExit(f"commit: {c}")
    up = req("PATCH", f"{API}/repos/{OLD}/git/refs/heads/main", {"sha": c["sha"]})
    print("  коммит:", "ok" if "_error" not in up else up)

# остались ли где-то ссылки на старый адрес
rest = [p for p in paths if p.endswith((".html", ".md"))
        and not p.startswith("docs/volna/") and p != "docs/index.html"]
print("  html/md вне папки volna:", len(rest))
