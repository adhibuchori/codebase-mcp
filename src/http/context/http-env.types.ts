/** Hono context variables: what the MCP route learns about a request, for the request log. */
export interface RpcSummary {
  readonly method: string;
  readonly tool: string;
  readonly args: string;
  readonly protocolVersion: string;
  readonly client: string;
}

export interface HttpEnv {
  Variables: {
    requestId: string;
    rpc: RpcSummary | undefined;
  };
}
