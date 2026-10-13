import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startTestRuntime, type TestRuntime } from '../../testing/helpers/test-runtime.ts';
import { createWorkspace, type Workspace } from '../../testing/helpers/workspace.ts';
import { createCatalog } from '../catalog.ts';

let workspace: Workspace;
let cold: TestRuntime;

beforeAll(async () => {
  workspace = createWorkspace({ repos: ['payments-go'] });
  mkdirSync(join(workspace.repoPath('payments-go'), 'tools'));
  writeFileSync(
    join(workspace.repoPath('payments-go'), 'tools/seed.py'),
    'def seed():\n    pass\n',
  );
  cold = await startTestRuntime(workspace, { index: false });
});

afterAll(async () => {
  await cold.close();
  workspace.cleanup();
});

test('a card is cached until the index state changes', async () => {
  const catalog = createCatalog(cold.runtime.context.deps);
  const repo = cold.runtime.context.deps.repos.get('payments-go');
  if (!repo) throw new Error('payments-go missing');
  const first = catalog.card(repo);
  expect(catalog.card(repo)).toBe(first);
  expect((await first).frameworks).toEqual(['gin', 'kafka-go']);
});

test('an unreadable build file means no frameworks, not a failed card', async () => {
  const deps = cold.runtime.context.deps;
  const catalog = createCatalog({
    ...deps,
    fs: { ...deps.fs, readText: async () => Promise.reject(new Error('EACCES')) },
  });
  const repo = deps.repos.get('payments-go');
  if (!repo) throw new Error('payments-go missing');
  const card = await catalog.card(repo);
  expect(card.frameworks).toEqual([]);
  expect(card.languages).toEqual([
    { id: 'go', files: 4 },
    { id: 'python', files: 1 },
  ]);
});
