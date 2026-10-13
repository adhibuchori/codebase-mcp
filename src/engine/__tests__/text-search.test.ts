import { afterAll, beforeAll, expect, test } from 'bun:test';
import { startTestRuntime, type TestRuntime } from '../../testing/helpers/test-runtime.ts';
import { createWorkspace, type Workspace } from '../../testing/helpers/workspace.ts';

let workspace: Workspace;
let app: TestRuntime;

beforeAll(async () => {
  workspace = createWorkspace();
  app = await startTestRuntime(workspace, { overrides: { logLevel: 'debug' } });
});

afterAll(async () => {
  await app.close();
  workspace.cleanup();
});

/** The search plan line logged by the last search. */
async function planOf(args: Record<string, unknown>): Promise<string> {
  app.logs.length = 0;
  await app.call('search_code', args);
  return app.logs.find((line) => line.includes(' DEBUG search plan ')) ?? '';
}

test('a broad search logs the index route, its candidates and the repos it ruled out', async () => {
  const line = await planOf({ query: 'Order already cancelled' });
  expect(line).toContain('pattern="Order already cancelled" mode=literal');
  expect(line).toContain('route="index: more than 3 repos" repos=6 indexRepos=1 candidateFiles=1');
  expect(line).toContain('ruledOut=5 scannedRepos=0 engines=index');
  expect(line).toMatch(/filesSearched=1 matches=1 timedOut=false planMs=\d+ ms=\d+$/);
});

test('a focused search and a pattern without a literal log why they were scanned', async () => {
  const focused = await planOf({ query: 'cancel', repos: ['orders-java'] });
  expect(focused).toContain('route="scan: 3 repos or fewer" repos=1 indexRepos=0');
  expect(focused).toContain('scannedRepos=1 engines=ripgrep');
  const noLiteral = await planOf({ query: 'a.b', mode: 'regex' });
  expect(noLiteral).toContain('route="scan: no literal of 3+ characters" repos=6');
});
