#!/usr/bin/env bash
# Read-only. Answers one question: is this instance worth driving?
# Changes nothing, downloads nothing, starts nothing.
#
# Usage: helpers/doctor.sh <RUN_ID>
set -uo pipefail

RUN_ID="${1:?usage: doctor.sh <RUN_ID>}"
REPO="$(cd "$(dirname "$0")/../../../.." && pwd)"
RUN_DIR="$REPO/verification/$RUN_ID/.run"
FAIL=0
say() { printf '%-5s %s\n' "$1" "$2"; [ "$1" = "FAIL" ] && FAIL=1; return 0; }

APP_DIR="$([ -f "$RUN_DIR/app_dir" ] && cat "$RUN_DIR/app_dir" || echo "$REPO/src")"
for f in index.html styles.css; do
  [ -f "$APP_DIR/$f" ] && say OK "app file $f" || say FAIL "app file $f missing under $APP_DIR"
done

# The module list is derived, not hand-kept: every relative import in the app's own
# scripts must resolve. A renamed or deleted module fails here instead of at runtime.
MODULES=$( { grep -rhoE "from '\./[A-Za-z0-9_.-]+\.js'" "$APP_DIR" 2>/dev/null | sed "s|from './||; s|'||"
             grep -hoE 'src="(\./)?[A-Za-z0-9_.-]+\.js"' "$APP_DIR/index.html" 2>/dev/null | sed 's|src="||; s|^\./||; s|"||'
           } | sort -u )
if [ -z "$MODULES" ]; then
  say FAIL "no relative imports found under $APP_DIR, so nothing could be checked"
else
  for m in $MODULES; do
    [ -f "$APP_DIR/$m" ] && say OK "module $m resolves" || say FAIL "module $m is imported but missing"
  done
fi

CHROME="$(ls -d "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux64/chrome 2>/dev/null | sort -V | tail -1)"
if [ -n "$CHROME" ]; then
  say OK "chromium $CHROME"
  LIB="${CHROME_DEPS_DIR:-$HOME/.cache/claude-chrome-deps}/root/usr/lib/x86_64-linux-gnu"
  MISSING="$(LD_LIBRARY_PATH="$LIB" ldd "$CHROME" 2>/dev/null | grep -c 'not found')"
  [ "$MISSING" = "0" ] && say OK "chromium libraries resolve" \
    || say FAIL "$MISSING chromium libraries missing, run helpers/ensure-chrome.sh"
else
  say FAIL "no chromium under ~/.cache/ms-playwright"
fi

node -e "require.resolve('playwright-core')" --input-type=commonjs >/dev/null 2>&1 \
  && say OK "playwright-core resolves" \
  || { [ -d "$(dirname "$0")/node_modules/playwright-core" ] \
       && say OK "playwright-core in helpers/node_modules" \
       || say FAIL "playwright-core missing, run: npm --prefix $(dirname "$0") install"; }

if [ -f "$RUN_DIR/server.pid" ] && [ -f "$RUN_DIR/port" ]; then
  PID="$(cat "$RUN_DIR/server.pid")"; PORT="$(cat "$RUN_DIR/port")"
  kill -0 "$PID" 2>/dev/null && say OK "server pid $PID alive" || say FAIL "server pid $PID is gone"
  # Port ownership: the port must serve OUR page, not whatever else grabbed it.
  if curl -sf "http://127.0.0.1:$PORT/index.html" | grep -q 'name="app" content="todo-app"'; then
    say OK "port $PORT serves this app"
  else
    say FAIL "port $PORT does not serve this app"
  fi
else
  say FAIL "no instance recorded for run $RUN_ID, run helpers/launch.sh first"
fi

[ "$FAIL" = "0" ] && echo "DOCTOR OK" || echo "DOCTOR FAILED"
exit "$FAIL"
