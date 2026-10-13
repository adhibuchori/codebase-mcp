import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNodeFileSystem } from '../../adapters/fs/node-file-system.ts';
import { commitAll, createWorkspace, git } from '../../testing/helpers/workspace.ts';
import { gitDirOf, gitStateFingerprint } from '../freshness.ts';

const fs = createNodeFileSystem();
const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

test('the fingerprint changes with commits and staging, and is empty outside git', async () => {
  const workspace = createWorkspace({ repos: ['contracts-proto'] });
  cleanups.push(workspace.cleanup);
  const root = workspace.repoPath('contracts-proto');
  const before = await gitStateFingerprint(fs, root);
  expect(before).toStartWith('ref: refs/heads/main|');
  writeFileSync(join(root, 'new.proto'), 'syntax = "proto3";');
  git(root, ['add', 'new.proto']);
  const staged = await gitStateFingerprint(fs, root);
  expect(staged).not.toBe(before);
  commitAll(root, 'feat: add proto');
  expect(await gitStateFingerprint(fs, root)).not.toBe(staged);
  expect(await gitStateFingerprint(fs, workspace.dir)).toBe('');
});

test('a .git file points at the real git directory, relative or absolute', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'codebase-mcp-gitdir-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'real/worktree'), { recursive: true });
  mkdirSync(join(dir, 'tree'), { recursive: true });
  writeFileSync(join(dir, 'tree/.git'), 'gitdir: ../real/worktree\n');
  expect(await gitDirOf(fs, join(dir, 'tree'))).toBe(`${join(dir, 'tree')}/../real/worktree`);
  writeFileSync(join(dir, 'tree/.git'), `gitdir: ${join(dir, 'real/worktree')}`);
  expect(await gitDirOf(fs, join(dir, 'tree'))).toBe(join(dir, 'real/worktree'));
  writeFileSync(join(dir, 'tree/.git'), 'garbage');
  expect(await gitDirOf(fs, join(dir, 'tree'))).toBeNull();
  writeFileSync(join(dir, 'real/worktree/HEAD'), 'abc123\n');
  writeFileSync(join(dir, 'tree/.git'), `gitdir: ${join(dir, 'real/worktree')}`);
  expect(await gitStateFingerprint(fs, join(dir, 'tree'))).toStartWith('abc123|');
});

test('unreadable git files count as empty instead of failing the refresh', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'codebase-mcp-gitdir-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, '.git'), 'gitdir: x');
  const unreadable = { ...fs, readText: async () => Promise.reject(new Error('EACCES')) };
  expect(await gitDirOf(unreadable, dir)).toBeNull();
  mkdirSync(join(dir, 'repo/.git'), { recursive: true });
  expect(await gitStateFingerprint(unreadable, join(dir, 'repo'))).toBe('|-|-|-');
});
