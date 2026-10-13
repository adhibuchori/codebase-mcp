import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  startTestRuntime,
  TEST_KEY,
  type TestRuntime,
} from '../../../testing/helpers/test-runtime.ts';
import { createWorkspace, type Workspace } from '../../../testing/helpers/workspace.ts';
import { withMcpAccept } from '../mcp-transport.ts';
import { summarizeRpc } from '../rpc-summary.ts';

let workspace: Workspace;
let app: TestRuntime;

beforeAll(async () => {
  workspace = createWorkspace({ repos: ['payments-go'] });
  app = await startTestRuntime(workspace, { index: false });
});

afterAll(async () => {
  await app.close();
  workspace.cleanup();
});

async function post(body: unknown, accept?: string): Promise<Response> {
  const headers: Record<string, string> = {
    'x-api-key': TEST_KEY,
    'content-type': 'application/json',
  };
  if (accept !== undefined) headers['accept'] = accept;
  return app.app.request('/mcp', { method: 'POST', headers, body: JSON.stringify(body) });
}

const INITIALIZE = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test', version: '1' },
  },
};

describe('the MCP endpoint', () => {
  test('initialize works whatever Accept the client sends', async () => {
    for (const accept of [
      undefined,
      '*/*',
      'application/json',
      'application/json, text/event-stream',
    ]) {
      const response = await post(INITIALIZE, accept);
      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        result: { serverInfo: { name: 'codebase-mcp', version: '0.0.0-test' } },
      });
      expect(JSON.stringify(body)).toContain('instructions');
    }
  });

  test('tools/list names the nine read-only tools', async () => {
    const body = await (await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).text();
    for (const name of [
      'list_repos',
      'repo_overview',
      'search_code',
      'find_files',
      'read_code',
      'find_symbol',
      'triage_error',
      'find_endpoint',
      'git_history',
    ])
      expect(body).toContain(`"name":"${name}"`);
    expect(body).toContain('"readOnlyHint":true');
  });

  test('a notification is accepted without a body', async () => {
    expect((await post({ jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202);
  });

  test('a tool with invalid arguments answers with a tool error, not a crash', async () => {
    const answer = await app.call('search_code', { query: '' });
    expect(answer.isError).toBe(true);
    expect(answer.text).toContain('Invalid arguments for tool search_code');
    const unknown = await app.call('no_such_tool', {});
    expect(unknown.isError).toBe(true);
  });
});

describe('withMcpAccept', () => {
  test('keeps every header and asks for JSON and SSE', () => {
    const request = withMcpAccept(
      new Request('http://x/mcp', {
        method: 'POST',
        headers: { accept: 'application/json', 'x-api-key': 'k' },
      }),
    );
    expect(request.headers.get('accept')).toBe('application/json, text/event-stream');
    expect(request.headers.get('x-api-key')).toBe('k');
    expect(request.method).toBe('POST');
  });
});

describe('summarizeRpc', () => {
  test('reads method, tool, arguments, protocol and client defensively', () => {
    expect(
      summarizeRpc({
        method: 'tools/call',
        params: { name: 'search_code', arguments: { query: 'x'.repeat(300) } },
      }),
    ).toMatchObject({ method: 'tools/call', tool: 'search_code', protocolVersion: '', client: '' });
    expect(
      summarizeRpc({ method: 'tools/call', params: { arguments: { query: 'x'.repeat(300) } } })
        ?.args,
    ).toHaveLength(200);
    expect(
      summarizeRpc([
        { method: 'initialize', params: { protocolVersion: 'v', clientInfo: { name: 'n' } } },
      ]),
    ).toMatchObject({ protocolVersion: 'v', client: 'n', args: '' });
    expect(summarizeRpc({ id: 1 })).toBeUndefined();
    expect(summarizeRpc('text')).toBeUndefined();
    expect(summarizeRpc(null)).toBeUndefined();
  });
});
