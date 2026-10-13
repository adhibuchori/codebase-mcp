/**
 * API-key check for /mcp: X-API-Key, or Authorization with any number of "Bearer " prefixes (a form
 * that adds its own prefix to a pasted "Bearer …" still works). Compared in constant time on hashes.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { createMiddleware } from 'hono/factory';
import type { HttpEnv } from '../context/http-env.types.ts';
import { jsonRpcError } from '../errors/json-rpc-error.ts';

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

export function presentedKey(headers: Headers): string {
  const direct = headers.get('x-api-key');
  if (direct) return direct.trim();
  return (headers.get('authorization') ?? '').replace(/^(Bearer\s+)+/i, '').trim();
}

export function keysMatch(presented: string, expected: string): boolean {
  return presented.length > 0 && timingSafeEqual(digest(presented), digest(expected));
}

export function apiKey(expected: string) {
  return createMiddleware<HttpEnv>(async (c, next) => {
    if (!keysMatch(presentedKey(c.req.raw.headers), expected))
      return c.json(jsonRpcError(-32001, 'Unauthorized'), 401);
    await next();
    return undefined;
  });
}
