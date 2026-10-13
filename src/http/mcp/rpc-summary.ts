/** What a JSON-RPC body asks for, read defensively from unknown JSON, for the request log. */
import type { RpcSummary } from '../context/http-env.types.ts';

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? new Map(Object.entries(value)).get(key)
    : undefined;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function summarizeRpc(body: unknown): RpcSummary | undefined {
  const message: unknown = Array.isArray(body) ? body[0] : body;
  const method = str(field(message, 'method'));
  if (!method) return undefined;
  const params = field(message, 'params');
  const client = field(params, 'clientInfo');
  const args = field(params, 'arguments');
  return {
    method,
    tool: str(field(params, 'name')),
    args: args === undefined ? '' : JSON.stringify(args).slice(0, 200),
    protocolVersion: str(field(params, 'protocolVersion')),
    client: client ? `${str(field(client, 'name'))} ${str(field(client, 'version'))}`.trim() : '',
  };
}
