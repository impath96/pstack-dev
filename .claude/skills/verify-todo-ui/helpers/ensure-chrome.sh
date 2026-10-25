#!/usr/bin/env bash
# Resolves a launchable Chromium and prints two lines: the binary path, then the
# directory to put on LD_LIBRARY_PATH.
#
# The Playwright Chromium in this environment links against libnss3, libnspr4 and
# libasound2, which are not installed system-wide. Installing them needs a sudo
# password, so this unpacks the Ubuntu packages into a user cache instead. The
# unpack is idempotent and runs only when a library is actually missing.
set -euo pipefail

CACHE="${CHROME_DEPS_DIR:-$HOME/.cache/claude-chrome-deps}"
LIB="$CACHE/root/usr/lib/x86_64-linux-gnu"

CHROME="$(ls -d "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux64/chrome 2>/dev/null | sort -V | tail -1 || true)"
if [ -z "$CHROME" ]; then
  echo "no chromium under ~/.cache/ms-playwright. run: npx playwright install chromium" >&2
  exit 1
fi

if LD_LIBRARY_PATH="$LIB" ldd "$CHROME" 2>/dev/null | grep -q "not found"; then
  echo "unpacking chromium libraries into $CACHE" >&2
  mkdir -p "$CACHE/debs" "$CACHE/root"
  ( cd "$CACHE/debs" && apt-get download libnspr4 libnss3 >/dev/null 2>&1 \
      && { apt-get download libasound2t64 >/dev/null 2>&1 || apt-get download libasound2 >/dev/null 2>&1; } )
  for d in "$CACHE"/debs/*.deb; do dpkg-deb -x "$d" "$CACHE/root"; done
  if LD_LIBRARY_PATH="$LIB" ldd "$CHROME" 2>/dev/null | grep -q "not found"; then
    echo "chromium still has unresolved libraries:" >&2
    LD_LIBRARY_PATH="$LIB" ldd "$CHROME" | grep "not found" >&2
    exit 1
  fi
fi

echo "$CHROME"
echo "$LIB"
