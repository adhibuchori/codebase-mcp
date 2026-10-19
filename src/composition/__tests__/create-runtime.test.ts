import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ConfigError } from '../../config/load-config.ts';
import { testOptions } from '../../testing/helpers/test-runtime.ts';
import { createWorkspace, writeConfig, type Workspace } from '../../testing/helpers/workspace.ts';
import { compileBlocked } from '../compile-blocked.ts';
import { createRuntime } from '../create-runtime.ts';

let workspace: Workspace;

beforeAll(() => {
  workspace = createWorkspace({ repos: ['payments-go', 'contracts-proto'] });
});

afterAll(() => workspace.cleanup());

describe('createRuntime', () => {
  test('indexes in worker threads, then answers through the index', async () => {
    const configPath = writeConfig(workspace, {
      roots: [{ path: workspace.root }, { path: `${workspace.dir}/missing` }],
    });
    const runtime = await createRuntime(
      testOptions(configPath, { indexRunner: 'threads', writeLog: () => {} }),
    );
    expect(runtime.configSource).toBe(configPath);
    expect(runtime.indexEnabled).toBe(true);
    expect(runtime.problems.join('\n')).toContain('missing');
    runtime.coordinator.start();
    await runtime.coordinator.idle();
    const repo = runtime.context.deps.repos.get('payments-go');
    if (!repo) throw new Error('payments-go was not discovered');
    expect(runtime.context.deps.index.status(repo).state).toBe('ready');
    expect(
      runtime.context.deps.index.findSymbols(repo, {
        name: 'Refund',
        match: 'exact',
        kind: '',
        limit: 5,
      })?.length,
    ).toBe(2);
    await runtime.close();
  });

  test('REPOS decides which repos are served; the config roots find nothing extra', async () => {
    const extra = createWorkspace({ repos: ['orders-java'] });
    const runtime = await createRuntime(
      testOptions(writeConfig(workspace), {
        reposEnv: `orders=${extra.repoPath('orders-java')};pay=${workspace.repoPath('payments-go')}`,
        writeLog: () => {},
      }),
    );
    expect(runtime.configSource).toStartWith('REPOS in .env (settings from ');
    expect(
      runtime.context.deps.repos
        .list()
        .map((repo) => repo.slug)
        .toSorted(),
    ).toEqual(['orders', 'pay']);
    await runtime.close();
    extra.cleanup();
  });

  test('reindex after a branch switch queues the repo, unless the index is off', async () => {
    const on = await createRuntime(testOptions(writeConfig(workspace), { writeLog: () => {} }));
    const repo = on.context.deps.repos.get('payments-go');
    if (!repo) throw new Error('payments-go was not discovered');
    on.context.deps.reindex(repo);
    expect(on.coordinator.live('payments-go')?.state).toBeDefined();
    await on.coordinator.idle();
    await on.close();
    const off = await createRuntime(
      testOptions(
        writeConfig(workspace, { index: { enabled: false, dir: `${workspace.dir}/index` } }),
        { writeLog: () => {} },
      ),
    );
    off.context.deps.reindex(repo);
    expect(off.coordinator.live('payments-go')).toBeUndefined();
    await off.close();
  });

  test('ripgrep can be switched off, leaving the JavaScript scanner', async () => {
    const runtime = await createRuntime(
      testOptions(writeConfig(workspace), { disableRipgrep: true, writeLog: () => {} }),
    );
    expect(runtime.ripgrep).toBeNull();
    expect(runtime.context.deps.rg).toBeNull();
    await runtime.close();
  });
});

describe('compileBlocked', () => {
  test('patterns are case-insensitive regexes; a bad one names itself', () => {
    expect(compileBlocked(['\\.secret$']).map((regex) => regex.test('A.SECRET'))).toEqual([true]);
    expect(() => compileBlocked(['('])).toThrow(ConfigError);
    expect(() => compileBlocked(['('])).toThrow('blocked pattern "(" is not a valid regex');
  });
});
