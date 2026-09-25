#!/usr/bin/env bash
# Keeps the preview servers alive.
#
# The OpenHands sandbox drops background processes when the session is idle, and
# the public work-1/work-2 links then answer "Bad Gateway". This script checks
# the two ports and starts whatever is missing, so the links keep working.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORTS="${PREVIEW_PORTS:-12000 12001}"
LOG_DIR="${TMPDIR:-/tmp}"

for port in $PORTS; do
  if curl -s -o /dev/null --max-time 5 "http://127.0.0.1:${port}/"; then
    echo "порт ${port}: уже работает"
    continue
  fi
  echo "порт ${port}: запускаю"
  (cd "$ROOT" && PORT="$port" nohup node server.js >> "${LOG_DIR}/deeprealm-${port}.log" 2>&1 &)
done

sleep 4
for port in $PORTS; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:${port}/" || echo 000)"
  echo "порт ${port}: ${code}"
done
