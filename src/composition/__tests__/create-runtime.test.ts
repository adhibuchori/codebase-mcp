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

  test('REPOS adds its repos; a repo the roots also find is served once, under its REPOS name', async () => {
    const extra = createWorkspace({ repos: ['orders-java'] });
    const runtime = await createRuntime(
      testOptions(writeConfig(workspace), {
        reposEnv: `orders=${extra.repoPath('orders-java')};again=${workspace.repoPath('payments-go')}`,
        writeLog: () => {},
      }),
    );
    expect(runtime.configSource).toEndWith(' + REPOS in .env');
    expect(
      runtime.context.deps.repos
        .list()
        .map((repo) => repo.slug)
        .toSorted(),
    ).toEqual(['again', 'contracts-proto', 'orders']);
    await runtime.close();
    extra.cleanup();
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
