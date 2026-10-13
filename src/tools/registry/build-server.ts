/**
 * The MCP server with every tool registered. Built per request in HTTP mode (stateless, like the
 * protocol's newest revision) and once in stdio mode. Tools are listed in a stable order.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { findEndpointTool, triageErrorTool } from '../debug/index.ts';
import { findFilesTool, readCodeTool } from '../files/index.ts';
import { gitHistoryTool } from '../history/index.ts';
import { listReposTool, repoOverviewTool } from '../repos/index.ts';
import { searchCodeTool } from '../search/index.ts';
import { findSymbolTool } from '../symbols/index.ts';
import type { ToolContext, ToolRegistrar } from './define-tool.ts';
import { serverInstructions } from './instructions.ts';

const TOOLS: readonly ToolRegistrar[] = [
  listReposTool,
  repoOverviewTool,
  searchCodeTool,
  findFilesTool,
  readCodeTool,
  findSymbolTool,
  triageErrorTool,
  findEndpointTool,
  gitHistoryTool,
];

export function buildMcpServer(context: ToolContext, version: string): McpServer {
  const server = new McpServer(
    { name: 'codebase-mcp', version },
    { instructions: serverInstructions(context.deps.repos.list().length) },
  );
  for (const register of TOOLS) register(server, context);
  return server;
}
