"""Доступ к песочнице «Логоса»: bash, загрузка файлов."""
import json, subprocess

HOST = "https://whclidsbzjgrjkoi.prod-runtime.all-hands.dev"
_KEY_PATH = "/workspace/project/preview-src/.logos-session-key"


def _key():
    return open(_KEY_PATH).read().strip()


def bash(cmd, timeout=300):
    payload = json.dumps({"command": cmd})
    p = subprocess.run(
        ["curl", "-s", "--max-time", str(timeout), "-X", "POST",
         f"{HOST}/api/bash/execute_bash_command",
         "-H", f"X-Session-API-Key: {_key()}",
         "-H", "Content-Type: application/json",
         "-d", payload],
        capture_output=True, text=True)
    try:
        d = json.loads(p.stdout)
    except json.JSONDecodeError:
        return p.stdout, p.stderr
    return d.get("stdout") or "", d.get("stderr") or ""


def download(remote_path):
    """Скачать файл из песочницы через base64."""
    import base64
    out, err = bash(f"base64 -w0 {remote_path}")
    if not out.strip():
        raise RuntimeError(f"не удалось скачать {remote_path}: {err}")
    return base64.b64decode(out.strip())
