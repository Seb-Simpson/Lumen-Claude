#!/usr/bin/env bash
# Runs tests/index.html in headless Chrome and fails if any test fails.
# No npm needed. Usage: tests/run-headless.sh [url]
# Set CHROME to the browser binary if it isn't google-chrome/chromium on PATH.
set -euo pipefail

URL="${1:-http://localhost:8000/tests/}"
CHROME="${CHROME:-$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)}"
if [ -z "$CHROME" ]; then echo "No Chrome/Chromium found. Set CHROME=/path/to/chrome." >&2; exit 2; fi

DOM="$("$CHROME" --headless=new --no-sandbox --disable-gpu --virtual-time-budget=20000 --dump-dom "$URL" 2>/dev/null)"
SUMMARY="$(printf '%s' "$DOM" | grep -o '<p id="summary"[^>]*>[^<]*' | sed 's/.*>//')"
echo "Lumen tests: ${SUMMARY:-no result (page did not finish)}"

# Print each failing test with its message.
printf '%s' "$DOM" | grep -o '<li class="fail">[^<]*<span class="err">[^<]*' | sed -e 's/<li class="fail">/  /' -e 's/<span class="err">/ — /' || true

case "$SUMMARY" in
  *" 0 failed"*) exit 0 ;;
  *) exit 1 ;;
esac
