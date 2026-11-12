#!/bin/bash
# macOS / Linux: start the server panel.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Get the LTS version from https://nodejs.org and run this again."
  read -r -p "Press Enter to close."
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Node.js 18 or newer is needed (you have $(node -v)). Update it from https://nodejs.org"
  read -r -p "Press Enter to close."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "First run: installing dependencies…"
  npm install --omit=dev || { read -r -p "Install failed. Press Enter to close."; exit 1; }
fi

node src/server.js
