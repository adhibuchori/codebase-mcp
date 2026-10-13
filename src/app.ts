/**
 * The HTTP app. The middleware order is part of the contract (kit Rule 41): request id first, so
 * every log line can carry it; secure headers before any body is produced; the request log; then,
 * for /mcp only, the body limit, the rate limit and the API key, in that order: an oversized body
 * is refused unread, a flood of guesses is cut off before the key is checked, and nothing reaches
 * the tools without the key.
 */
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import { bodyTooLarge, notFound, onAppError } from './http/errors/app-errors.ts';
import { healthRoutes } from './http/health/health.routes.ts';
import type { HttpEnv } from './http/context/http-env.types.ts';
import { mcpRoutes, type McpHandler } from './http/mcp/mcp.routes.ts';
import { apiKey } from './http/middlewares/api-key.middleware.ts';
import { rateLimit, type RateLimiter } from './http/middlewares/rate-limit.middleware.ts';
import { requestLog } from './http/middlewares/request-log.middleware.ts';
import type { Clock, Logger } from './ports/runtime.ts';

export interface AppOptions {
  readonly apiKey: string;
  readonly handleMcp: McpHandler;
  readonly limiter: RateLimiter;
  readonly logger: Logger;
  readonly clock: Clock;
}

export function createApp(options: AppOptions): Hono<HttpEnv> {
  const app = new Hono<HttpEnv>();
  app.use('*', requestId());
  app.use('*', secureHeaders());
  app.use('*', requestLog(options.logger, options.clock));
  app.route('/', healthRoutes());
  app.use('/mcp', bodyLimit({ maxSize: 1024 * 1024, onError: bodyTooLarge }));
  app.use('/mcp', rateLimit(options.limiter));
  app.use('/mcp', apiKey(options.apiKey));
  app.route('/', mcpRoutes(options.handleMcp));
  app.notFound(notFound);
  app.onError(onAppError(options.logger));
  return app;
}
