#!/usr/bin/env python3
"""Pull the current workspace from an OpenHands conversation and push it to GitHub.

Any sandbox or chat can run this to publish its latest site files, so the live
site never depends on one specific sandbox staying alive.

Required environment:
  CONV_ID              app-conversation id, or "latest" to use the newest conversation
  REPO                 target repo slug, e.g. grigoriy131112-sketch/deeprealm-site
  GITHUB_TOKEN         token with contents:write
  OPENHANDS_API_KEY    OpenHands Cloud API key
Optional:
  BRANCH               target branch (default: main)
  WORKSPACE_PATH       path inside the sandbox (default: /workspace/project)
  APP_BASE             app server base (default: https://app.all-hands.dev)
"""

import json
import os
import re
import subprocess
import time
import urllib.error
import urllib.request

APP_BASE = os.environ.get("APP_BASE", "https://app.all-hands.dev").rstrip("/")
OH_KEY = os.environ.get("OPENHANDS_API_KEY") or os.environ.get("OPENHANDS_CLOUD_API_KEY", "")
GH_TOKEN = os.environ.get("GITHUB_TOKEN", "")
REPO = os.environ.get("REPO", "")
BRANCH = os.environ.get("BRANCH", "main")
WORKSPACE_PATH = os.environ.get("WORKSPACE_PATH", "/workspace/project")
# Optional escape hatch: a sandbox resumed from an ERROR state may have rotated
# its session key, and the live key is not discoverable through the API.
SESSION_KEY_OVERRIDE = os.environ.get("SESSION_API_KEY", "")


def api(path, method="GET", body=None, key=None, raw=False, with_type=False, base=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request((base or APP_BASE) + path, data=data, method=method)
    req.add_header("Accept", "application/json")
    if key:
        req.add_header("X-Session-API-Key", key)
    else:
        req.add_header("Authorization", "Bearer " + OH_KEY)
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            payload = resp.read()
            ctype = resp.headers.get("content-type", "")
    except urllib.error.HTTPError as err:
        raise SystemExit(f"{method} {path} -> HTTP {err.code}: {err.read()[:400]!r}")
    if raw and with_type:
        return payload, ctype
    return payload if raw else json.loads(payload)


def items_of(payload):
    if isinstance(payload, dict):
        return payload.get("items", [])
    return payload or []


def resolve_conversation():
    cid = os.environ.get("CONV_ID", "").strip()
    if cid and cid != "latest":
        return cid
    items = items_of(api("/api/v1/app-conversations/search?limit=20"))
    if not items:
        raise SystemExit("no conversations found")
    return items[0]["id"]


def wait_for_sandbox(sandbox_id, timeout=120):
    deadline = time.time() + timeout
    while time.time() < deadline:
        for sb in items_of(api("/api/v1/sandboxes/search?limit=50")):
            if sb.get("id") == sandbox_id and sb.get("status") == "RUNNING":
                return sb
        time.sleep(5)
    raise SystemExit(f"sandbox {sandbox_id} did not reach RUNNING within {timeout}s")


def fetch_patch(agent_base, conv_id, session_keys, attempts=4):
    """Fetch the workspace patch, trying candidate session keys.

    A sandbox that has been resumed can report a fresh key while the running
    agent server still accepts the previous one, so try each candidate.
    """
    path = f"/api/conversations/{conv_id}/file/archive?path={WORKSPACE_PATH}"
    keys = [k for k in dict.fromkeys(session_keys) if k]
    if not keys:
        raise SystemExit("no session key available for this sandbox")
    last = ""
    for _ in range(attempts):
        for key in keys:
            try:
                body, ctype = api(path, key=key, raw=True, with_type=True, base=agent_base)
            except SystemExit as err:
                last = str(err)
                continue
            if ctype and "text/x-patch" in ctype:
                return body.decode("utf-8", "replace")
            last = f"unexpected content-type {ctype}"
        time.sleep(5)
    raise SystemExit(f"could not fetch workspace patch: {last}")


def run(cmd, cwd, stdin=None, check=True):
    proc = subprocess.run(cmd, cwd=cwd, input=stdin, text=True, capture_output=True)
    if check and proc.returncode != 0:
        raise SystemExit(f"{' '.join(cmd[:3])} failed: {proc.stderr[:400]}")
    return proc


def main():
    for name, val in (("OPENHANDS_API_KEY", OH_KEY), ("GITHUB_TOKEN", GH_TOKEN), ("REPO", REPO)):
        if not val:
            raise SystemExit(f"{name} is required")

    conv_id = resolve_conversation()
    conv = items_of(api(f"/api/v1/app-conversations?ids={conv_id}"))[0]
    sandbox_id = conv["sandbox_id"]
    print(f"conversation {conv_id} (sandbox {sandbox_id}, status {conv['sandbox_status']})")

    api(f"/api/v1/sandboxes/{sandbox_id}/resume", method="POST")
    sandbox = wait_for_sandbox(sandbox_id)

    # Keys can rotate while the sandbox restarts: collect every candidate and
    # let fetch_patch try them.
    candidates = [SESSION_KEY_OVERRIDE, conv.get("session_api_key"), sandbox.get("session_api_key")]
    for sb in items_of(api("/api/v1/sandboxes/search?limit=50")):
        if sb.get("id") == sandbox_id and sb.get("session_api_key"):
            candidates.append(sb["session_api_key"])

    agent_base = conv["conversation_url"].rsplit("/api/conversations", 1)[0]
    patch = fetch_patch(agent_base, conv_id, candidates)
    if not patch.strip():
        raise SystemExit("workspace patch is empty; nothing to publish")
    print(f"fetched workspace patch: {len(patch)} bytes")

    workdir = os.environ.get("SYNC_DIR", "/tmp/deeprealm-sync")
    remote = os.environ.get("GIT_REMOTE") or f"https://x-access-token:{GH_TOKEN}@github.com/{REPO}.git"
    if os.path.isdir(os.path.join(workdir, ".git")):
        run(["git", "fetch", "origin", BRANCH], workdir, check=False)
        run(["git", "checkout", "-B", BRANCH, f"origin/{BRANCH}"], workdir, check=False)
        run(["git", "reset", "--hard", f"origin/{BRANCH}"], workdir, check=False)
    else:
        run(["git", "clone", "--branch", BRANCH, remote, workdir], None, check=False)
        if not os.path.isdir(os.path.join(workdir, ".git")):
            os.makedirs(workdir, exist_ok=True)
            run(["git", "init", "-b", BRANCH], workdir)
            run(["git", "remote", "add", "origin", remote], workdir)
    run(["git", "remote", "set-url", "origin", remote], workdir, check=False)

    # The archive is a diff against an empty tree, so drop the paths it carries
    # before applying. Files the repo has but the sandbox does not are kept.
    for _, target in re.findall(r"^diff --git a/(.+?) b/(.+)$", patch, re.M):
        local = os.path.join(workdir, target)
        if os.path.isfile(local) or os.path.islink(local):
            os.remove(local)

    run(["git", "apply", "--whitespace=nowarn", "-"], workdir, stdin=patch)
    run(["git", "add", "-A"], workdir)
    status = run(["git", "status", "--porcelain"], workdir).stdout.strip()
    if not status:
        print("no changes to publish")
        return
    run(["git", "-c", "user.name=openhands", "-c", "user.email=openhands@all-hands.dev",
         "commit", "-m", f"Sync site from conversation {conv_id}\n\nCo-authored-by: openhands <openhands@all-hands.dev>"], workdir)
    run(["git", "push", "origin", f"HEAD:{BRANCH}"], workdir)
    print(f"published to {REPO}#{BRANCH}")
    print("host will auto-deploy from the new commit")


if __name__ == "__main__":
    main()
