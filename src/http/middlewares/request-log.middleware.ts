/**
 * One log line per request with what a failing client needs to be diagnosed: method and path, the
 * JSON-RPC method and tool, the client's protocol version and name on initialize, the status and
 * the time taken, and the caller's address.
 */
import { createMiddleware } from 'hono/factory';
import type { Clock, Logger } from '../../ports/runtime.ts';
import type { HttpEnv, RpcSummary } from '../context/http-env.types.ts';
import { clientIp } from './client-ip.ts';

function rpcFields(rpc: RpcSummary | undefined): Record<string, string> {
  if (!rpc) return {};
  const fields: Record<string, string> = { rpc: rpc.method };
  if (rpc.tool) fields['tool'] = rpc.tool;
  if (rpc.args) fields['args'] = rpc.args;
  if (rpc.protocolVersion) fields['protocol'] = rpc.protocolVersion;
  if (rpc.client) fields['client'] = rpc.client;
  return fields;
}

export function requestLog(logger: Logger, clock: Clock) {
  return createMiddleware<HttpEnv>(async (c, next) => {
    const started = clock.now();
    await next();
    logger.info(`${c.req.method} ${c.req.path} ${c.res.status}`, {
      ...rpcFields(c.get('rpc')),
      ms: clock.now() - started,
      ip: clientIp(c.req.raw.headers),
      accept: c.req.header('accept') ?? '',
    });
  });
}
