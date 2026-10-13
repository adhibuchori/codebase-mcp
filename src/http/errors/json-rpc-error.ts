/** The JSON-RPC error body MCP clients understand, for answers the transport never sees. */
export function jsonRpcError(
  code: number,
  message: string,
): { jsonrpc: '2.0'; error: { code: number; message: string }; id: null } {
  return { jsonrpc: '2.0', error: { code, message }, id: null };
}
