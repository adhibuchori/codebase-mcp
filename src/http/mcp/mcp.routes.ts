/** /mcp: POST carries the JSON-RPC exchange; other methods are not used in stateless mode. */
import { Hono } from 'hono';
import type { HttpEnv } from '../context/http-env.types.ts';
import type { IncomingRequest } from './mcp-transport.ts';
import { jsonRpcError } from '../errors/json-rpc-error.ts';
import { summarizeRpc } from './rpc-summary.ts';

export type McpHandler = (request: IncomingRequest, body: unknown) => Promise<Response>;

async function readJson(request: { json(): Promise<unknown> }): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export function mcpRoutes(handle: McpHandler): Hono<HttpEnv> {
  const router = new Hono<HttpEnv>();
  router.post('/mcp', async (c) => {
    const body = await readJson(c.req.raw.clone());
    if (body === undefined)
      return c.json(jsonRpcError(-32700, 'Parse error: the body is not JSON'), 400);
    c.set('rpc', summarizeRpc(body));
    return handle(c.req.raw, body);
  });
  router.all('/mcp', (c) => {
    c.header('Allow', 'POST');
    return c.json(jsonRpcError(-32000, 'Method not allowed'), 405);
  });
  return router;
}
