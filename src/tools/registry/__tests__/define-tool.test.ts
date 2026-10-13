import { afterAll, beforeAll, expect, test } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ToolError } from '../../../core/errors/tool-error.ts';
import type { LogFields } from '../../../ports/runtime.ts';
import { startTestRuntime, type TestRuntime } from '../../../testing/helpers/test-runtime.ts';
import { createWorkspace, type Workspace } from '../../../testing/helpers/workspace.ts';
import { defineTool, type ToolContext } from '../define-tool.ts';

let workspace: Workspace;
let runtime: TestRuntime;
const errors: LogFields[] = [];

beforeAll(async () => {
  workspace = createWorkspace({ repos: ['contracts-proto'] });
  runtime = await startTestRuntime(workspace, { index: false });
});

afterAll(async () => {
  await runtime.close();
  workspace.cleanup();
});

async function call(run: () => Promise<string>, budget = 10_000) {
  const deps = runtime.runtime.context.deps;
  const logger = {
    ...deps.logger,
    error: (_message: string, fields: LogFields = {}) => void errors.push(fields),
  };
  const context: ToolContext = { ...runtime.runtime.context, deps: { ...deps, logger }, budget };
  const server = new McpServer({ name: 'test', version: '1' });
  defineTool({
    name: 'probe',
    title: 'Probe',
    description: 'Test tool.',
    input: { word: z.string().default('x') },
    run,
  })(server, context);
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: 'test-client', version: '1' });
  await client.connect(clientSide);
  const result = await client.callTool({ name: 'probe', arguments: {} });
  await client.close();
  const content: unknown = result.content;
  const first: unknown = Array.isArray(content) ? content[0] : undefined;
  const text =
    typeof first === 'object' && first !== null ? String(Reflect.get(first, 'text')) : '';
  return { text, isError: result.isError === true };
}

test('an answer is redacted and held under the budget', async () => {
  const answer = await call(async () => `token ghp_${'a'.repeat(36)} ${'x'.repeat(5000)}`, 600);
  expect(answer.isError).toBe(false);
  expect(answer.text).toContain('[REDACTED]');
  expect(answer.text.length).toBeLessThanOrEqual(600);
});

test('a ToolError keeps its message and hint and is not logged as a failure', async () => {
  const answer = await call(async () =>
    Promise.reject(new ToolError('Unknown repo "x".', 'Call list_repos.')),
  );
  expect(answer).toEqual({
    text: 'Error: Unknown repo "x".\nHint: Call list_repos.',
    isError: true,
  });
  expect(errors).toHaveLength(0);
});

test('any other failure is logged with its stack and answered generically', async () => {
  const answer = await call(async () =>
    Promise.reject(new Error('disk exploded at /Users/me/secret')),
  );
  expect(answer.isError).toBe(true);
  expect(answer.text).not.toContain('/Users/me');
  expect(String(errors[0]?.['error'])).toContain('disk exploded');
  await call(async () => Promise.reject('a plain string'));
  expect(errors[1]?.['error']).toBe('a plain string');
});
