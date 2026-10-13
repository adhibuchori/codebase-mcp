/** /health: a liveness answer for tunnels and `bun run check`. It reveals nothing about the repos. */
import { Hono } from 'hono';
import type { HttpEnv } from '../context/http-env.types.ts';

export function healthRoutes(): Hono<HttpEnv> {
  const router = new Hono<HttpEnv>();
  router.get('/health', (c) => c.json({ ok: true }));
  return router;
}
