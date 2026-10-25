#!/usr/bin/env bash
# Tears down only what this run started. Never matches on process name.
#
# Usage: helpers/cleanup.sh <RUN_ID>
# Removes verification/<RUN_ID>/.run and leaves every proof artifact in place.
set -euo pipefail

RUN_ID="${1:?usage: cleanup.sh <RUN_ID>}"
REPO="$(cd "$(dirname "$0")/../../../.." && pwd)"
RUN_DIR="$REPO/verification/$RUN_ID/.run"

if [ -f "$RUN_DIR/server.pid" ]; then
  PID="$(cat "$RUN_DIR/server.pid")"
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null || true
    for _ in $(seq 1 20); do kill -0 "$PID" 2>/dev/null || break; sleep 0.1; done
    kill -9 "$PID" 2>/dev/null || true
  fi
  echo "stopped pid $PID"
else
  echo "no server.pid for run $RUN_ID, nothing to stop"
fi

rm -rf "$RUN_DIR"
echo "artifacts kept in $REPO/verification/$RUN_ID"
