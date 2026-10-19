import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Repo } from '../../../core/model/domain.types.ts';
import { rejectionOf } from '../../../testing/helpers/rejection.ts';
import {
  commitAll,
  createWorkspace,
  git,
  type Workspace,
} from '../../../testing/helpers/workspace.ts';
import { createGitSwitcher } from '../git-switcher.ts';

let workspace: Workspace;
let origin: Repo;
const switcher = createGitSwitcher({
  baseEnv: { PATH: process.env['PATH'] ?? '' },
  timeoutMs: 20_000,
});
const repoAt = (root: string): Repo => ({ slug: 'payments-go', root, group: '' });
const current = (root: string): string => git(root, ['branch', '--show-current']).trim();

/** A clone of the origin repo: whole, or partial (blobs fetched only when a checkout needs them). */
function cloneOrigin(name: string, partial: boolean): string {
  const target = join(workspace.dir, name);
  const filter = partial ? ['--filter=blob:none'] : [];
  git(workspace.dir, ['clone', '-q', ...filter, `file://${origin.root}`, target]);
  return target;
}

beforeAll(() => {
  workspace = createWorkspace({ repos: ['payments-go'] });
  origin = repoAt(workspace.repoPath('payments-go'));
  git(origin.root, ['config', 'uploadpack.allowFilter', 'true']);
  git(origin.root, ['switch', '-q', '-c', 'develop']);
  writeFileSync(join(origin.root, 'DEVELOP.md'), 'only on develop\n');
  commitAll(origin.root, 'feat: develop work');
  git(origin.root, ['switch', '-q', 'main']);
});

afterAll(() => workspace.cleanup());

describe('state', () => {
  test('names the current branch and the local ones, and counts tracked changes only', async () => {
    expect(await switcher.state(origin)).toEqual({
      current: 'main',
      branches: ['develop', 'main'],
      remote: [],
      changed: 0,
    });
    writeFileSync(join(origin.root, 'untracked.txt'), 'new\n');
    const main = join(origin.root, 'main.go');
    const before = readFileSync(main, 'utf8');
    writeFileSync(main, `${before}// edited\n`);
    expect((await switcher.state(origin)).changed).toBe(1);
    writeFileSync(main, before);
    git(origin.root, ['clean', '-qf']);
  });

  test('a detached HEAD has no current branch', async () => {
    git(origin.root, ['switch', '-q', '--detach', 'main']);
    expect((await switcher.state(origin)).current).toBe('');
    git(origin.root, ['switch', '-q', 'main']);
  });
});

describe('switchTo', () => {
  test('switches to a local branch and back', async () => {
    await switcher.switchTo(origin, 'develop');
    expect(current(origin.root)).toBe('develop');
    expect(existsSync(join(origin.root, 'DEVELOP.md'))).toBe(true);
    await switcher.switchTo(origin, 'main');
    expect(existsSync(join(origin.root, 'DEVELOP.md'))).toBe(false);
  });

  test('never runs a repo hook, which plain git would run', async () => {
    const marker = join(workspace.dir, 'hook-ran');
    const hooks = join(origin.root, '.git', 'hooks');
    mkdirSync(hooks, { recursive: true });
    writeFileSync(join(hooks, 'post-checkout'), `#!/bin/sh\necho ran > "${marker}"\n`);
    chmodSync(join(hooks, 'post-checkout'), 0o755);
    await switcher.switchTo(origin, 'develop');
    await switcher.switchTo(origin, 'main');
    expect(existsSync(marker)).toBe(false);
    git(origin.root, ['switch', '-q', 'develop']);
    expect(existsSync(marker)).toBe(true);
    git(origin.root, ['switch', '-q', 'main']);
  });

  test('lists the fetched remote branches, without the remote HEAD', async () => {
    const clone = cloneOrigin('listed-clone', false);
    const state = await switcher.state(repoAt(clone));
    expect(state.branches).toEqual(['main']);
    expect(state.remote.map((remote) => [remote.ref, remote.name])).toEqual([
      ['origin/develop', 'develop'],
      ['origin/main', 'main'],
    ]);
    expect(state.remote[0]?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('git never picks a remote branch on its own, which plain git would', async () => {
    const clone = cloneOrigin('whole-clone', false);
    expect((await rejectionOf(switcher.switchTo(repoAt(clone), 'develop'))).message).toContain(
      'invalid reference',
    );
    expect(git(clone, ['branch', '--list', 'develop']).trim()).toBe('');
    git(clone, ['switch', '-q', 'develop']);
    expect(current(clone)).toBe('develop');
  });

  test('creates a local branch from the fetched remote branch it is given, tracking it', async () => {
    const clone = cloneOrigin('created-clone', false);
    await switcher.switchTo(repoAt(clone), 'develop', 'origin/develop');
    expect(current(clone)).toBe('develop');
    expect(git(clone, ['rev-parse', '--abbrev-ref', 'develop@{upstream}']).trim()).toBe(
      'origin/develop',
    );
    expect(existsSync(join(clone, 'DEVELOP.md'))).toBe(true);
  });

  test('a partial clone never fetches the objects a switch would need', async () => {
    const clone = cloneOrigin('partial-clone', true);
    expect(
      (await rejectionOf(switcher.switchTo(repoAt(clone), 'develop', 'origin/develop'))).message,
    ).toContain("transport 'file' not allowed");
    expect(current(clone)).toBe('main');
    git(clone, ['switch', '-q', 'develop']);
    expect(current(clone)).toBe('develop');
  });

  test('a value that looks like an option is a branch name, and unknown', async () => {
    expect((await rejectionOf(switcher.switchTo(origin, '-f'))).message).toContain(
      'invalid reference: -f',
    );
    expect((await rejectionOf(switcher.switchTo(origin, 'x', '-f'))).message).toContain(
      'invalid reference: -f',
    );
    expect(current(origin.root)).toBe('main');
  });
});
