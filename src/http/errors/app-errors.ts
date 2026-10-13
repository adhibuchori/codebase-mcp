/** App-wide answers for unknown routes and unexpected errors: JSON-RPC shaped, nothing internal leaked. */
import type { Context } from 'hono';
import type { Logger } from '../../ports/runtime.ts';
import type { HttpEnv } from '../context/http-env.types.ts';
import { jsonRpcError } from './json-rpc-error.ts';

export function notFound(c: Context<HttpEnv>): Response {
  return c.json(
    jsonRpcError(
      -32601,
      `Not found: ${c.req.method} ${c.req.path}. The MCP endpoint is POST /mcp.`,
    ),
    404,
  );
}

export function onAppError(logger: Logger) {
  return (error: Error, c: Context<HttpEnv>): Response => {
    logger.error('request failed', { path: c.req.path, error: error.stack ?? error.message });
    return c.json(jsonRpcError(-32603, 'Internal error'), 500);
  };
}

export function bodyTooLarge(c: Context<HttpEnv>): Response {
  return c.json(jsonRpcError(-32600, 'Request body too large'), 413);
}
