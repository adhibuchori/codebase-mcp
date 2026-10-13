import { describe, expect, test } from 'bun:test';
import { createApp } from '../app.ts';
import type { McpHandler } from '../http/mcp/mcp.routes.ts';
import { createRateLimiter } from '../http/middlewares/rate-limit.middleware.ts';
import type { LogFields, Logger } from '../ports/runtime.ts';

const KEY = 'app-test-key-0123456789abcdef';
const OK: McpHandler = async () => Response.json({ jsonrpc: '2.0', id: 1, result: {} });

function setup(options: { handle?: McpHandler; limit?: number } = {}) {
  const lines: { level: string; message: string; fields: LogFields }[] = [];
  const record =
    (level: string) =>
    (message: string, fields: LogFields = {}): void => {
      lines.push({ level, message, fields });
    };
  const logger: Logger = {
    debug: record('debug'),
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
  };
  const clock = { now: () => 1000 };
  const limiter = createRateLimiter({ limit: options.limit ?? 100, windowMs: 60_000, clock });
  const app = createApp({ apiKey: KEY, handleMcp: options.handle ?? OK, limiter, logger, clock });
  return { app, lines };
}

const rpc = (
  headers: Record<string, string>,
  body = '{"jsonrpc":"2.0","id":1,"method":"ping"}',
): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body,
});

const from = (ip: string): RequestInit => rpc({ 'cf-connecting-ip': ip });

describe('createApp', () => {
  test('/health answers without a key and says nothing else', async () => {
    const { app } = setup();
    const response = await app.request('/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  test('the key is required, in either header, and a pasted "Bearer" prefix is tolerated', async () => {
    const { app } = setup();
    expect((await app.request('/mcp', rpc({}))).status).toBe(401);
    expect((await app.request('/mcp', rpc({ authorization: 'Bearer wrong' }))).status).toBe(401);
    expect((await app.request('/mcp', rpc({ 'x-api-key': KEY }))).status).toBe(200);
    expect((await app.request('/mcp', rpc({ authorization: `Bearer Bearer ${KEY}` }))).status).toBe(
      200,
    );
  });

  test('a body that is not JSON is a parse error; other methods are refused', async () => {
    const { app } = setup();
    const broken = await app.request('/mcp', rpc({ 'x-api-key': KEY }, '{nope'));
    expect(broken.status).toBe(400);
    expect(await broken.json()).toMatchObject({ error: { code: -32700 } });
    const get = await app.request('/mcp', { headers: { 'x-api-key': KEY } });
    expect(get.status).toBe(405);
    expect(get.headers.get('allow')).toBe('POST');
  });

  test('unknown paths, oversized bodies and handler failures answer in JSON-RPC shape', async () => {
    const { app, lines } = setup({
      handle: async () => {
        throw new Error('boom at /secret/path');
      },
    });
    const missing = await app.request('/nope');
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({
      error: { message: 'Not found: GET /nope. The MCP endpoint is POST /mcp.' },
    });
    const large = await app.request(
      '/mcp',
      rpc(
        { 'x-api-key': KEY, 'content-length': String(2 * 1024 * 1024) },
        'x'.repeat(2 * 1024 * 1024),
      ),
    );
    expect(large.status).toBe(413);
    const failed = await app.request('/mcp', rpc({ 'x-api-key': KEY }));
    expect(failed.status).toBe(500);
    expect(await failed.text()).not.toContain('secret');
    expect(
      lines.some((line) => line.level === 'error' && String(line.fields['error']).includes('boom')),
    ).toBe(true);
  });

  test('the rate limit applies per caller before the key is checked', async () => {
    const { app } = setup({ limit: 2 });
    expect((await app.request('/mcp', from('1.1.1.1'))).status).toBe(401);
    expect((await app.request('/mcp', from('1.1.1.1'))).status).toBe(401);
    expect((await app.request('/mcp', from('1.1.1.1'))).status).toBe(429);
    expect((await app.request('/mcp', from('2.2.2.2'))).status).toBe(401);
  });

  test('every request is logged with what the client asked for', async () => {
    const { app, lines } = setup();
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', clientInfo: { name: 'ClickUp', version: '1' } },
    });
    await app.request(
      '/mcp',
      rpc(
        { 'x-api-key': KEY, accept: 'application/json', 'x-forwarded-for': '9.9.9.9, 10.0.0.1' },
        body,
      ),
    );
    expect(lines.at(-1)).toMatchObject({
      message: 'POST /mcp 200',
      fields: {
        rpc: 'initialize',
        protocol: '2025-06-18',
        client: 'ClickUp 1',
        ip: '9.9.9.9',
        accept: 'application/json',
        ms: 0,
      },
    });
    await app.request('/health');
    expect(lines.at(-1)).toMatchObject({
      message: 'GET /health 200',
      fields: { ip: 'local', accept: '' },
    });
  });
});
