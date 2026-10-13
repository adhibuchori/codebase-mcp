/**
 * Starts the HTTP server on Bun.serve or @hono/node-server. Bun.serve closes a request after 10
 * idle seconds by default, shorter than a large search may need, so the timeout is raised.
 */
import { isBun } from './platform.ts';

export interface HttpServer {
  readonly url: string;
  close(): Promise<void>;
}

export interface ServeOptions {
  readonly fetch: (request: Request) => Response | Promise<Response>;
  readonly port: number;
  readonly hostname: string;
}

export async function startHttpServer(options: ServeOptions): Promise<HttpServer> {
  const url = `http://${options.hostname}:${options.port}`;
  if (isBun()) {
    const server = Bun.serve({
      fetch: options.fetch,
      port: options.port,
      hostname: options.hostname,
      idleTimeout: 120,
    });
    return { url, close: () => server.stop(true) };
  }
  const { serve } = await import('@hono/node-server');
  const server = serve({ fetch: options.fetch, port: options.port, hostname: options.hostname });
  return {
    url,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  };
}
