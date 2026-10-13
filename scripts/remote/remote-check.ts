#!/usr/bin/env bun
/**
 * `bun run check [url]`: checks the public MCP URL end to end, the way ClickUp calls it — health,
 * the initialize handshake with a plain JSON Accept header, tools/list with the API key, a wrong key
 * refused, and (with Cloudflare Access) a request without the service token refused.
 * Reads PUBLIC_URL, MCP_API_KEY, CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET from .env.
 */
import { loadEnvFile } from '../shared/env-file.ts';

loadEnvFile();

const base = (process.argv[2] || process.env['PUBLIC_URL'] || '')
  .trim()
  .replace(/\/+$/, '')
  .replace(/\/mcp$/, '');
if (!base) {
  console.error(
    '❌ No URL to check. Set PUBLIC_URL in .env, or run: bun run check https://<your-tunnel-url>',
  );
  process.exit(1);
}

const apiKey = process.env['MCP_API_KEY'] ?? '';
const id = process.env['CF_ACCESS_CLIENT_ID'];
const secret = process.env['CF_ACCESS_CLIENT_SECRET'];
const access: Record<string, string> =
  id && secret ? { 'CF-Access-Client-Id': id, 'CF-Access-Client-Secret': secret } : {};
/* Pinggy's free tunnels show a browser screening page unless this header is sent. */
const tunnelHeaders: Record<string, string> = base.includes('pinggy')
  ? { 'X-Pinggy-No-Screen': '1' }
  : {};
let failed = false;

function report(ok: boolean, message: string): void {
  console.log(`${ok ? '✅' : '❌'} ${message}`);
  if (!ok) failed = true;
}

function request(
  path: string,
  headers: Record<string, string> = {},
  body?: unknown,
): Promise<Response> {
  const json =
    body === undefined ? {} : { 'Content-Type': 'application/json', Accept: 'application/json' };
  return fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...tunnelHeaders, ...headers, ...json },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
  });
}

async function field(
  response: Response,
  pick: (value: Record<string, unknown>) => unknown,
): Promise<unknown> {
  if (!response.ok) return null;
  const value: unknown = await response.json();
  return typeof value === 'object' && value !== null
    ? pick(Object.fromEntries(Object.entries(value)))
    : null;
}

const listTools = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
const bearer = { ...access, Authorization: `Bearer ${apiKey}` };

console.log(`Checking ${base}\n`);
try {
  /* Cloudflare Access guards the public hostname only; the local server has nothing in front of it. */
  const local = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base);
  if (id && secret && !local) {
    const blocked = await request('/health');
    report(
      blocked.status !== 200,
      `Without the service token, Cloudflare Access blocks the request (HTTP ${blocked.status})`,
    );
  }
  const health = await request('/health', access);
  report(health.ok, `Server reachable through the tunnel (HTTP ${health.status})`);
  const init = await request('/mcp', bearer, {
    jsonrpc: '2.0',
    id: 0,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'codebase-mcp-check', version: '2' },
    },
  });
  const server = await field(
    init,
    (body) => JSON.stringify(body['result'] ?? '').match(/"name":"([^"]+)"/)?.[1],
  );
  report(
    typeof server === 'string',
    typeof server === 'string'
      ? `MCP handshake works (server "${server}")`
      : `MCP handshake failed (HTTP ${init.status})`,
  );
  const tools = await field(
    await request('/mcp', bearer, listTools),
    (body) => JSON.stringify(body['result'] ?? '').match(/"name":"[a-z_]+"/g)?.length,
  );
  report(
    typeof tools === 'number' && tools > 0,
    typeof tools === 'number' ? `API key accepted, ${tools} tools listed` : 'MCP tools/list failed',
  );
  const wrong = await request(
    '/mcp',
    { ...access, Authorization: 'Bearer wrong-key-for-testing' },
    listTools,
  );
  report(wrong.status === 401, `A wrong API key is refused (HTTP ${wrong.status})`);
} catch (error) {
  const reason =
    error instanceof Error
      ? error.cause instanceof Error
        ? error.cause.message
        : error.message
      : String(error);
  report(false, `Cannot reach ${base} (${reason})`);
  console.log('   Is the server running (bun start) and the tunnel open (bun tunnel)?');
}

console.log(
  failed
    ? '\nSome checks failed.'
    : '\nAll good. Use the same URL (+ /mcp), API key and headers in ClickUp.',
);
process.exit(failed ? 1 : 0);
