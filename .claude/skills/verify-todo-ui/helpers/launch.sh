#!/usr/bin/env bash
# Starts one isolated instance of the todo UI and waits until it actually serves the app.
#
# Usage: helpers/launch.sh <RUN_ID> [APP_DIR]
# Picks a free port, writes verification/<RUN_ID>/.run/{server.pid,port,app_dir},
# and prints "READY <url>". Two runs with different RUN_IDs never share a port.
set -euo pipefail

RUN_ID="${1:?usage: launch.sh <RUN_ID> [APP_DIR]}"
REPO="$(cd "$(dirname "$0")/../../../.." && pwd)"
APP_DIR="${2:-$REPO/src}"
RUN_DIR="$REPO/verification/$RUN_ID/.run"

[ -f "$APP_DIR/index.html" ] || { echo "no index.html under $APP_DIR" >&2; exit 1; }
mkdir -p "$RUN_DIR"

PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
( cd "$APP_DIR" && exec python3 -m http.server "$PORT" --bind 127.0.0.1 ) >"$RUN_DIR/server.log" 2>&1 &
echo $! > "$RUN_DIR/server.pid"
echo "$PORT" > "$RUN_DIR/port"
echo "$APP_DIR" > "$RUN_DIR/app_dir"

URL="http://127.0.0.1:$PORT/index.html"
for _ in $(seq 1 50); do
  # Ready means the app is served, not just that a socket answers. The marker is the
  # page title, so a stray server on the port fails the wait instead of passing it.
  if curl -sf "$URL" | grep -q 'name="app" content="todo-app"'; then
    echo "READY $URL"
    exit 0
  fi
  sleep 0.2
done

echo "timed out waiting for $URL" >&2
cat "$RUN_DIR/server.log" >&2
exit 1
