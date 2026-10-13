#!/usr/bin/env bash
# CI (self-test.yml, Node runtime job): the locked-down Windows laptop path. Runs on Node without
# Bun and, with CODEBASE_NO_RIPGREP=1, without ripgrep. Writes a config for three fixture repos,
# builds their index (worker threads, node:sqlite), boots the HTTP server, runs `bun run check`'s
# script against it, and calls three tools over HTTP the way ClickUp does.
#
#   CODEBASE_NO_RIPGREP=1 bash scripts/ci/node-runtime.sh
set -euo pipefail
cd "$(dirname "$0")/../.." || exit 2

node_ts() {
  node --disable-warning=ExperimentalWarning "$@"
}

MCP_API_KEY="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")"
export MCP_API_KEY

# A config and an index of its own in a temporary folder, so a developer's codebase.config.json and
# .cache/ are never touched when this runs on a laptop.
work="$(mktemp -d)"
export CODEBASE_CONFIG="$work/codebase.config.json"
# Paths written into the JSON must be native: Git Bash on Windows prints /d/a/… from pwd, which Node
# cannot open; pwd -W prints D:/a/…. Elsewhere pwd -W does not exist and plain pwd is right.
native() { (cd "$1" && (pwd -W 2>/dev/null || pwd)); }
root="$(native .)"
work_native="$(native "$work")"

cat >"$CODEBASE_CONFIG" <<JSON
{
  "repos": [
    { "name": "orders-java", "path": "$root/tests/fixtures/repos/orders-java", "group": "shop" },
    { "name": "payments-go", "path": "$root/tests/fixtures/repos/payments-go", "group": "shop" },
    { "name": "contracts-proto", "path": "$root/tests/fixtures/repos/contracts-proto", "group": "shop" }
  ],
  "index": { "dir": "$work_native/index" }
}
JSON

node_ts src/index.ts index

# Started directly, not through node_ts, so $! is the server itself and the trap stops it.
node --disable-warning=ExperimentalWarning src/index.ts start >server.log 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true; rm -rf "$work"' EXIT
for _ in $(seq 1 60); do
  curl -sf http://127.0.0.1:8787/health >/dev/null && break
  sleep 1
done

node_ts scripts/remote/remote-check.ts http://127.0.0.1:8787

call() {
  curl -sf http://127.0.0.1:8787/mcp \
    -H "Authorization: Bearer $MCP_API_KEY" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"$1\",\"arguments\":$2}}"
}

expect_in() {
  local tool="$1" args="$2" wanted="$3" answer
  answer="$(call "$tool" "$args")"
  if ! grep -q "$wanted" <<<"$answer"; then
    echo "::error::$tool $args did not mention $wanted: $answer"
    exit 1
  fi
  echo "✅ $tool finds $wanted"
}

expect_in search_code '{"query":"Order already cancelled"}' 'OrderService.java'
expect_in find_symbol '{"name":"Refund"}' 'handler.go'
expect_in find_endpoint '{"query":"POST /api/payments/77/refund"}' 'PaymentClient.java'
echo "Node runtime: index, boot, search, symbols and endpoints work without Bun and without ripgrep."
