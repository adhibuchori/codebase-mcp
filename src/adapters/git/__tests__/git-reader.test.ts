import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Repo } from '../../../core/model/domain.types.ts';
import { commitAll, createWorkspace, type Workspace } from '../../../testing/helpers/workspace.ts';
import { gitError } from '../git-command.ts';
import { createGitReader, listGitFiles } from '../git-reader.ts';
import { rejectionOf } from '../../../testing/helpers/rejection.ts';

let workspace: Workspace;
let repo: Repo;
const context = { baseEnv: { PATH: process.env['PATH'] ?? '' }, timeoutMs: 20_000 };
const reader = createGitReader(context, []);

beforeAll(() => {
  workspace = createWorkspace({ repos: ['payments-go'] });
  repo = { slug: 'payments-go', root: workspace.repoPath('payments-go'), group: 'shop' };
  appendFileSync(
    join(repo.root, 'internal/payment/service.go'),
    '\n// Partial refunds are tracked separately.\n',
  );
  writeFileSync(join(repo.root, 'server.pem'), 'not really a key');
  commitAll(repo.root, 'feat: note partial refunds');
});

afterAll(() => workspace.cleanup());

describe('log and pickaxe', () => {
  test('log lists commits, newest first, for the repo or a path', async () => {
    const all = await reader.log(repo, { limit: 10, path: '', since: '', rev: '' });
    expect(all.map((commit) => commit.subject)).toEqual([
      'feat: note partial refunds',
      'feat: import payments-go',
    ]);
    const forFile = await reader.log(repo, { limit: 10, path: 'main.go', since: '', rev: 'HEAD' });
    expect(forFile.map((commit) => commit.subject)).toEqual(['feat: import payments-go']);
    expect(await reader.log(repo, { limit: 5, path: '', since: '2090-01-01', rev: '' })).toEqual(
      [],
    );
  });

  test('pickaxe finds the commit that added a string, literally or by regex', async () => {
    const added = await reader.pickaxe(repo, {
      limit: 5,
      path: '',
      text: 'Partial refunds',
      regex: false,
    });
    expect(added.map((commit) => commit.subject)).toEqual(['feat: note partial refunds']);
    const byRegex = await reader.pickaxe(repo, {
      limit: 5,
      path: 'internal',
      text: 'ErrAlready[A-Za-z]+',
      regex: true,
    });
    expect(byRegex.map((commit) => commit.subject)).toEqual(['feat: import payments-go']);
  });

  test('a value that looks like an option is never read as one', async () => {
    const injected = await reader.pickaxe(repo, {
      limit: 5,
      path: '',
      text: '--output=/tmp/pwned',
      regex: false,
    });
    expect(injected).toEqual([]);
    expect(
      (
        await rejectionOf(
          reader.log(repo, { limit: 5, path: '', since: '', rev: '--output=/tmp/pwned' }),
        )
      ).message,
    ).toContain('git failed');
  });
});

describe('blame and show', () => {
  test('blame names the commit of each line', async () => {
    const lines = await reader.blame(repo, 'internal/payment/service.go', { start: 1, end: 3 });
    expect(lines.map((line) => line.line)).toEqual([1, 2, 3]);
    expect(lines[0]?.summary).toBe('feat: import payments-go');
    expect(lines[0]?.text).toBe('package payment');
    expect(lines[0]?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('show gives the stat and the diff, with sensitive files hidden', async () => {
    const detail = await reader.show(repo, 'HEAD', 200);
    expect(detail.summary.subject).toBe('feat: note partial refunds');
    expect(detail.stat).toContain('service.go');
    expect(detail.patch).toContain('+// Partial refunds are tracked separately.');
    expect(detail.patch).toContain('(diff of a sensitive file hidden)');
    expect(detail.patch).not.toContain('not really a key');
    expect(detail.patchCut).toBe(false);
    expect((await reader.show(repo, 'HEAD', 2)).patchCut).toBe(true);
  });

  test('an unknown revision is a clear error', async () => {
    expect((await rejectionOf(reader.show(repo, 'deadbeef', 10))).message).toContain(
      'was not found',
    );
  });
});

test('isRepo and listGitFiles', async () => {
  expect(await reader.isRepo(repo)).toBe(true);
  const files = await listGitFiles(context, repo.root);
  expect(files).toContain('main.go');
  expect(files).toContain('internal/payment/handler.go');
  expect(await listGitFiles(context, workspace.dir)).toBeNull();
  expect(await reader.isRepo({ slug: 'x', root: workspace.dir, group: '' })).toBe(false);
});

test('gitError explains a timeout and the first error line', () => {
  const base = { code: 128, stdout: '', truncated: false, stopped: false };
  expect(gitError({ ...base, stderr: '', timedOut: true })).toContain('too long');
  expect(gitError({ ...base, stderr: '\nfatal: bad revision\nmore', timedOut: false })).toBe(
    'git failed: bad revision',
  );
  expect(gitError({ ...base, stderr: '', timedOut: false })).toBe('git failed: unknown error');
});
