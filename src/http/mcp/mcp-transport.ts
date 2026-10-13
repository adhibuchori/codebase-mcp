/**
 * One stateless MCP exchange on the SDK's Web-standard Streamable HTTP transport, answered as plain
 * JSON. The SDK refuses (406) a request whose Accept header does not list both JSON and SSE; some
 * clients send only application/json, a wildcard or nothing, and the answer is JSON anyway, so the
 * header is normalised first. The body was already parsed by the route and is passed along.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

/** The parts of an incoming request the transport needs, whatever Request type the framework uses. */
export interface IncomingRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: { forEach(callback: (value: string, key: string) => void): void };
}

export function withMcpAccept(request: IncomingRequest): Request {
  const headers = new Headers();
  request.headers.forEach((value, key) => headers.set(key, value));
  headers.set('accept', 'application/json, text/event-stream');
  return new Request(request.url, { method: request.method, headers });
}

export async function handleMcpRequest(
  request: IncomingRequest,
  body: unknown,
  build: () => McpServer,
): Promise<Response> {
  const server = build();
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(withMcpAccept(request), { parsedBody: body });
  } finally {
    await server.close();
  }
}
