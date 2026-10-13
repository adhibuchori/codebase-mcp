/**
 * A fixed-window limit per client address. The decision is made once, before next() runs, and the
 * bookkeeping never wraps next(), so a request is never answered twice (the kit's
 * rate-limit-double-next anti-pattern). Stale windows are dropped so the table cannot grow forever.
 */
import { createMiddleware } from 'hono/factory';
import type { Clock } from '../../ports/runtime.ts';
import type { HttpEnv } from '../context/http-env.types.ts';
import { clientIp } from './client-ip.ts';
import { jsonRpcError } from '../errors/json-rpc-error.ts';

export interface RateLimiter {
  /** True when the caller is still within the limit; counts the request. */
  allow(key: string): boolean;
  size(): number;
}

export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
  clock: Clock;
}): RateLimiter {
  const windows = new Map<string, { count: number; start: number }>();
  const prune = (now: number): void => {
    for (const [key, window] of windows)
      if (now - window.start >= options.windowMs) windows.delete(key);
  };
  return {
    allow: (key) => {
      const now = options.clock.now();
      if (windows.size > 1000) prune(now);
      const current = windows.get(key);
      const window =
        current && now - current.start < options.windowMs ? current : { count: 0, start: now };
      window.count++;
      windows.set(key, window);
      return window.count <= options.limit;
    },
    size: () => windows.size,
  };
}

export function rateLimit(limiter: RateLimiter) {
  return createMiddleware<HttpEnv>(async (c, next) => {
    if (!limiter.allow(clientIp(c.req.raw.headers)))
      return c.json(jsonRpcError(-32002, 'Too many requests'), 429);
    await next();
    return undefined;
  });
}
