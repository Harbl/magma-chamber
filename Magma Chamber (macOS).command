#!/bin/bash
# Double-click to run Magma Chamber on a Mac.
#
# Serving from localhost is what makes signup import work without any proxy:
# the Riftbound locator API allowlists "localhost", but not hosted origins.
#
# Tries whatever runtime the Mac already has before asking for an install.

cd "$(dirname "$0")" || exit 1
PORT=8080
URL="http://localhost:$PORT"

# Already running from an earlier double-click? Just reopen the window.
if curl -s -o /dev/null --max-time 2 "$URL"; then
  echo "Magma Chamber is already running."
  open "$URL"
  exit 0
fi

open_soon() { sleep 1; open "$URL"; }

echo "Starting Magma Chamber at $URL"
echo "Keep this window open. Closing it stops the app."
echo

if command -v node >/dev/null 2>&1; then
  open_soon &
  exec node tools/serve.js "$PORT"

# Ruby ships with macOS and its bundled 2.6 still includes WEBrick.
elif [ -x /usr/bin/ruby ]; then
  open_soon &
  exec /usr/bin/ruby -run -e httpd . -p "$PORT" -b 127.0.0.1

elif command -v php >/dev/null 2>&1; then
  open_soon &
  exec php -S "localhost:$PORT"

# Last: python3 may be a stub that pops an Xcode install prompt, so it goes below
# the runtimes that either work or are cleanly absent.
elif command -v python3 >/dev/null 2>&1; then
  open_soon &
  exec python3 -m http.server "$PORT" --bind 127.0.0.1

else
  echo "No usable runtime was found on this Mac."
  echo
  echo "Install Node.js from https://nodejs.org (take the LTS installer),"
  echo "then double-click this file again."
  echo
  read -r -p "Press Return to close."
  exit 1
fi
