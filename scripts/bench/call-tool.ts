/** Calls one tool through the MCP transport, in process, and returns its text. */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { handleMcpRequest } from '../../src/http/mcp/mcp-transport.ts';
import { toolText } from '../../src/testing/helpers/test-runtime.ts';

export async function callTool(
  build: () => McpServer,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const body = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } };
  const request = new Request('http://bench.local/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  });
  const response = await handleMcpRequest(request, body, build);
  return toolText(await response.json()).text;
}
