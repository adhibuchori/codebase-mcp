import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { startTestRuntime, type TestRuntime } from '../../../testing/helpers/test-runtime.ts';
import { commitAll, createWorkspace, type Workspace } from '../../../testing/helpers/workspace.ts';

let workspace: Workspace;
let app: TestRuntime;

beforeAll(async () => {
  workspace = createWorkspace();
  const payments = workspace.repoPath('payments-go');
  appendFileSync(
    join(payments, 'internal/payment/service.go'),
    '\n// ErrExpired is returned for an expired payment.\nvar ErrExpired = errors.New("payment expired")\n',
  );
  commitAll(payments, 'fix: reject expired payments');
  app = await startTestRuntime(workspace);
});

afterAll(async () => {
  await app.close();
  workspace.cleanup();
});

describe('git_history', () => {
  test('log for the repo and for a path', async () => {
    const all = await app.call('git_history', { repo: 'payments-go' });
    expect(all.text).toStartWith('payments-go: 2 commits for the whole repo');
    expect(all.text).toMatch(/[0-9a-f]{7} \d{4}-\d{2}-\d{2} Test: fix: reject expired payments/);
    const path = await app.call('git_history', { repo: 'payments-go', path: 'main.go', limit: 5 });
    expect(path.text).toStartWith('payments-go: 1 commit for main.go');
    expect(
      (await app.call('git_history', { repo: 'payments-go', since: '14 days' })).text,
    ).toContain('2 commits');
  });

  test('pickaxe by string and by regex', async () => {
    const added = await app.call('git_history', {
      repo: 'payments-go',
      action: 'pickaxe',
      query: 'payment expired',
    });
    expect(added.text).toContain('fix: reject expired payments');
    expect(added.text).not.toContain('import payments-go');
    const regex = await app.call('git_history', {
      repo: 'payments-go',
      action: 'pickaxe',
      query: 'Err[A-Za-z]+ =',
      regex: true,
    });
    expect(regex.text).toContain('2 commits');
    const missing = await app.call('git_history', { repo: 'payments-go', action: 'pickaxe' });
    expect(missing.isError).toBe(true);
  });

  test('blame a range, in the author time zone', async () => {
    const { text } = await app.call('git_history', {
      repo: 'payments-go',
      action: 'blame',
      path: 'main.go',
      lines: '11-12',
    });
    expect(text).toStartWith('Blame payments-go/main.go (2 lines)');
    expect(text).toContain('  11: func main() {');
    const bad = await app.call('git_history', {
      repo: 'payments-go',
      action: 'blame',
      path: 'main.go',
      lines: 'x',
    });
    expect(bad.isError).toBe(true);
    expect((await app.call('git_history', { repo: 'payments-go', action: 'blame' })).isError).toBe(
      true,
    );
  });

  test('show a commit, refusing option-like revisions', async () => {
    const show = await app.call('git_history', {
      repo: 'payments-go',
      action: 'show',
      rev: 'HEAD',
    });
    expect(show.text).toContain('fix: reject expired payments');
    expect(show.text).toContain('+var ErrExpired = errors.New("payment expired")');
    const injected = await app.call('git_history', {
      repo: 'payments-go',
      action: 'show',
      rev: '--output=/tmp/x',
    });
    expect(injected.isError).toBe(true);
    expect((await app.call('git_history', { repo: 'payments-go', action: 'show' })).isError).toBe(
      true,
    );
  });

  test('a folder that is not a git repo says so', async () => {
    const plain = createWorkspace({ git: false, repos: ['payments-go'] });
    const local = await startTestRuntime(plain, {
      index: false,
      config: { roots: [], repos: [{ name: 'payments-go', path: plain.repoPath('payments-go') }] },
    });
    const { text, isError } = await local.call('git_history', { repo: 'payments-go' });
    expect(isError).toBe(true);
    expect(text).toContain('not a git repository');
    await local.close();
    plain.cleanup();
  });
});
