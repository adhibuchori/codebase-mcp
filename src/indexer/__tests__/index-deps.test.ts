import { afterEach, expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createShardPool } from '../../adapters/index/shard-pool.ts';
import { loadSqlite } from '../../adapters/index/sqlite.ts';
import { createConsoleLogger } from '../../adapters/logger/console-logger.ts';
import { PROJECT_DIR } from '../../testing/helpers/test-runtime.ts';
import { commitAll, createWorkspace, type Workspace } from '../../testing/helpers/workspace.ts';
import { createIndexDeps, createInlineRunner, shardPathFor } from '../index-deps.ts';

let workspace: Workspace;

afterEach(() => workspace.cleanup());

test('the inline runner indexes a repo with the configured blocked names left out', async () => {
  workspace = createWorkspace({ repos: ['payments-go'] });
  const root = workspace.repoPath('payments-go');
  writeFileSync(join(root, 'prod.secrets.yaml'), 'token: x');
  commitAll(root, 'chore: add a secret');
  const indexDir = join(workspace.dir, 'index');
  const settings = {
    indexDir,
    maxFileBytes: 1024 * 1024,
    blocked: ['\\.secrets\\.yaml$'],
    exclude: ['**/*.mod'],
    grammarsDir: join(PROJECT_DIR, 'assets/grammars'),
    queriesDir: join(PROJECT_DIR, 'assets/queries'),
    gitEnv: { PATH: process.env['PATH'] ?? '' },
    gitTimeoutMs: 20_000,
  };
  const runner = createInlineRunner(
    await createIndexDeps(
      settings,
      createConsoleLogger('error', () => {}),
    ),
  );
  const repo = { slug: 'payments-go', root, group: '' };
  const outcome = await runner.run(repo, () => {});
  await runner.close();
  expect(outcome.files).toBe(4);
  const pool = createShardPool({
    open: await loadSqlite(),
    shardPath: (target) => shardPathFor(indexDir, target),
    exists: () => true,
    liveStatus: () => undefined,
    maxOpen: 2,
  });
  expect(
    pool
      .files(repo)
      ?.map((file) => file.path)
      .toSorted(),
  ).toEqual([
    'internal/events/consumer.go',
    'internal/payment/handler.go',
    'internal/payment/service.go',
    'main.go',
  ]);
  pool.closeAll();
});
