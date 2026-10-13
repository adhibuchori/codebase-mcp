#!/bin/bash
# Start the MCP server + a tunnel on Mac in one go. Ctrl+C stops both.
# To keep the server running and open the tunnel only when needed, use `bun start` and `bun tunnel` instead.
cd "$(dirname "$0")"
[ -f .env ] || { echo "❌ .env not found. Copy .env.example to .env and fill it in."; exit 1; }
command -v bun >/dev/null || { echo "❌ Bun is not installed: brew install oven-sh/bun/bun"; exit 1; }
[ -d node_modules ] || bun install

bun server.js &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null" EXIT
sleep 1
kill -0 $SERVER_PID 2>/dev/null || { echo "❌ The server failed to start, see the error above."; exit 1; }

echo ""
bun tunnel.js
