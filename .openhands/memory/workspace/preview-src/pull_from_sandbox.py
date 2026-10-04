"""Забирает файлы сайта из песочницы другой беседы через agent-server bash API."""
import base64, json, subprocess, sys

HOST = sys.argv[1]
KEY = sys.argv[2]
CMD = sys.argv[3]
DEST = sys.argv[4] if len(sys.argv) > 4 else None

payload = json.dumps({"command": CMD})
out = subprocess.run(
    ["curl", "-s", "--max-time", "180", "-X", "POST",
     f"{HOST}/api/bash/execute_bash_command",
     "-H", f"X-Session-API-Key: {KEY}",
     "-H", "Content-Type: application/json",
     "-d", payload],
    capture_output=True, text=True).stdout

d = json.loads(out)
stdout = d.get("stdout") or ""
stderr = d.get("stderr") or ""

if DEST:
    base64.b64decode(stdout.strip(), validate=False)
    with open(DEST, "wb") as f:
        f.write(base64.b64decode(stdout.strip()))
    print(f"записано {DEST}")
else:
    print(stdout)
    if stderr:
        print("STDERR:", stderr[:500], file=sys.stderr)
