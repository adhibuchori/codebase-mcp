# The ClickUp URL must end in /mcp

**Symptom.** ClickUp cannot validate the server; the request log shows `POST / 404` (or nothing,
when a tunnel's landing page answers first).

**Cause.** The MCP endpoint is `POST /mcp`. The tunnel prints its base URL
(`https://xxxx.trycloudflare.com`), and pasting that alone points ClickUp at `/`.

**Fix.** Paste the tunnel URL with `/mcp` appended. The 404 answer for unknown paths says so
(`src/http/errors.ts#notFound`), and `bun run check` accepts the URL with or without `/mcp`.

**Signal it is back.** `404` for `/` in the request log right after connecting a client.
