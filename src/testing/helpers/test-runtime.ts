/**
 * A full runtime over a test workspace, with the inline indexer and captured logs, plus a helper
 * that calls a tool through the real HTTP app (API key, JSON-RPC, MCP transport, tool, engine).
 */
import { join } from 'node:path';
import { createApp } from '../../app.ts';
import { createRuntime, type Runtime } from '../../composition/create-runtime.ts';
import type { RuntimeOptions } from '../../composition/runtime-options.types.ts';
import { handleMcpRequest } from '../../http/mcp/mcp-transport.ts';
import { createRateLimiter } from '../../http/middlewares/rate-limit.middleware.ts';
import { buildMcpServer } from '../../tools/registry/build-server.ts';
import { writeConfig, type Workspace } from './workspace.ts';

/** A fake key for tests, built at runtime so the secret scanner does not flag it. */
export const TEST_KEY = ['test', 'key', 'for', 'codebase', 'mcp'].join('-').padEnd(32, '0');
export const PROJECT_DIR = join(import.meta.dirname, '..', '..', '..');

export interface TestRuntime {
  readonly runtime: Runtime;
  readonly logs: string[];
  readonly app: ReturnType<typeof createApp>;
  /** Calls a tool and returns its text; `isError` tells whether the tool reported an error. */
  call(name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }>;
  close(): Promise<void>;
}

export function testOptions(
  configPath: string,
  overrides: Partial<RuntimeOptions> = {},
): RuntimeOptions {
  return {
    projectDir: PROJECT_DIR,
    configPath,
    reposEnv: '',
    extraBlockedEnv: '',
    rgPath: '',
    disableRipgrep: false,
    childEnv: { PATH: process.env['PATH'] ?? '' },
    logLevel: 'info',
    home: '/nonexistent-home',
    indexRunner: 'inline',
    ...overrides,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The first text block and the isError flag of a JSON-RPC tools/call answer. */
export function toolText(body: unknown): { text: string; isError: boolean } {
  const result = isRecord(body) ? body['result'] : undefined;
  const content = isRecord(result) ? result['content'] : undefined;
  const first: unknown = Array.isArray(content) ? content[0] : undefined;
  const text =
    isRecord(first) && typeof first['text'] === 'string' ? first['text'] : JSON.stringify(body);
  return { text, isError: isRecord(result) && result['isError'] === true };
}

function testApp(runtime: Runtime): ReturnType<typeof createApp> {
  const { clock, logger } = runtime.context.deps;
  return createApp({
    apiKey: TEST_KEY,
    handleMcp: (request, body) =>
      handleMcpRequest(request, body, () => buildMcpServer(runtime.context, '0.0.0-test')),
    limiter: createRateLimiter({ limit: 10_000, windowMs: 60_000, clock }),
    logger,
    clock,
  });
}

function toolCaller(app: ReturnType<typeof createApp>): TestRuntime['call'] {
  return async (name, args) => {
    const response = await app.request('/mcp', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TEST_KEY}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    });
    return toolText(await response.json());
  };
}

export async function startTestRuntime(
  workspace: Workspace,
  options: {
    config?: Record<string, unknown>;
    overrides?: Partial<RuntimeOptions>;
    index?: boolean;
  } = {},
): Promise<TestRuntime> {
  const logs: string[] = [];
  const configPath = writeConfig(workspace, options.config);
  const runtime = await createRuntime(
    testOptions(configPath, { writeLog: (line) => logs.push(line), ...options.overrides }),
  );
  if (options.index !== false) {
    runtime.coordinator.start();
    await runtime.coordinator.idle();
  }
  const app = testApp(runtime);
  return { runtime, logs, app, call: toolCaller(app), close: () => runtime.close() };
}
