---
paths:
  - 'src/http/mcp/**'
---

# The MCP SDK answers 406 to clients that accept only JSON

**Symptom.** A client connects but fails to validate; the request log shows `POST /mcp 406`.

**Cause.** The SDK's Streamable HTTP transport refuses a POST whose `Accept` header does not list both
`application/json` and `text/event-stream`. Several clients send only `application/json`, a wildcard,
or nothing.

**Fix.** `src/http/mcp/mcp-transport.ts#withMcpAccept` rewrites the header before the transport sees
it; the answer is plain JSON anyway (`enableJsonResponse: true`). `scripts/remote/remote-check.ts`
calls with `Accept: application/json` on purpose, so the check catches a regression.

**Signal it is back.** `406` in the request log, or a transport change that drops `withMcpAccept`.
