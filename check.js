#!/usr/bin/env bun
/**
 * Check the public MCP URL end to end, the way ClickUp will call it.
 * Reads PUBLIC_URL, MCP_API_KEY and (for Cloudflare Access) CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET from .env.
 * Usage: bun run check            (uses PUBLIC_URL)
 *        bun run check <url>      (e.g. a quick tunnel URL)
 */
import { loadDotEnv } from "./env.js";

loadDotEnv();

const base = (process.argv[2] || process.env.PUBLIC_URL || "").trim().replace(/\/+$/, "").replace(/\/mcp$/, "");
if (!base) {
  console.error("❌ No URL to check. Set PUBLIC_URL in .env, or run: bun run check https://<your-tunnel-url>");
  process.exit(1);
}

const { MCP_API_KEY = "", CF_ACCESS_CLIENT_ID: id, CF_ACCESS_CLIENT_SECRET: secret } = process.env;
const access = id && secret ? { "CF-Access-Client-Id": id, "CF-Access-Client-Secret": secret } : {};
/** Pinggy's free tunnels show a browser screening page unless this header is sent */
const tunnelHeaders = base.includes("pinggy") ? { "X-Pinggy-No-Screen": "1" } : {};

let failed = false;
function report(ok, message) {
  console.log(`${ok ? "✅" : "❌"} ${message}`);
  if (!ok) failed = true;
}

function request(path, headers = {}, body) {
  return fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: { ...tunnelHeaders, ...headers, ...(body && { "Content-Type": "application/json", Accept: "application/json" }) },
    body: body && JSON.stringify(body),
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
}

const listTools = { jsonrpc: "2.0", id: 1, method: "tools/list" };

console.log(`Checking ${base}\n`);
try {
  if (id && secret) {
    const res = await request("/health");
    report(res.status !== 200, `Without the service token, Cloudflare Access blocks the request (HTTP ${res.status})`);
  }

  const health = await request("/health", access);
  report(health.ok, `Server reachable through the tunnel (HTTP ${health.status})`);
  if (!health.ok && (health.status === 302 || health.status === 403) && !(id && secret)) {
    console.log("   Cloudflare Access seems to be on. Set CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET in .env.");
  }

  /** The handshake every MCP client starts with, sent with a plain JSON Accept header like many clients do */
  const init = await request("/mcp", { ...access, Authorization: `Bearer ${MCP_API_KEY}` }, {
    jsonrpc: "2.0", id: 0, method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "codebase-mcp-check", version: "1" } },
  });
  const server = init.ok ? (await init.json()).result?.serverInfo?.name : null;
  report(Boolean(server), server ? `MCP handshake works (server "${server}")` : `MCP handshake failed (HTTP ${init.status})`);

  const res = await request("/mcp", { ...access, Authorization: `Bearer ${MCP_API_KEY}` }, listTools);
  const tools = res.ok ? (await res.json()).result?.tools?.map((t) => t.name) : null;
  report(Boolean(tools?.length), tools ? `API key accepted, ${tools.length} tools: ${tools.join(", ")}` : `MCP request failed (HTTP ${res.status})`);

  const bad = await request("/mcp", { ...access, Authorization: "Bearer wrong-key-for-testing" }, listTools);
  report(bad.status === 401, `A wrong API key is rejected (HTTP ${bad.status})`);
} catch (e) {
  report(false, `Can't reach ${base} (${e.cause?.message || e.message})`);
  console.log("   Is the server running (bun start) and the tunnel open (bun tunnel)?");
}

console.log(failed ? "\nSome checks failed." : "\nAll good. Use the same URL (+ /mcp), API key and headers in ClickUp.");
process.exit(failed ? 1 : 0);
