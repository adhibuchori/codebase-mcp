import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNodeFileSystem } from '../../adapters/fs/node-file-system.ts';
import { configSchema } from '../config-schema.ts';
import { discoverRepos } from '../discover-repos.ts';
import { buildRegistry, createRegistry, expandHome, slugify } from '../repo-registry.ts';

const fs = createNodeFileSystem();
let dir = '';

afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** work/payments/orders, work/payments/ledger (a worktree-style .git file), work/web, work/node_modules/x, work/archive/old */
function layout(): string {
  dir = mkdtempSync(join(tmpdir(), 'codebase-mcp-registry-'));
  const work = join(dir, 'work');
  for (const repo of ['payments/orders', 'web', 'node_modules/x', 'archive/old', 'deep/a/b/c/d'])
    mkdirSync(join(work, repo, '.git'), { recursive: true });
  mkdirSync(join(work, 'payments/ledger'), { recursive: true });
  writeFileSync(join(work, 'payments/ledger/.git'), 'gitdir: ../../.git/worktrees/ledger');
  mkdirSync(join(work, 'web', 'packages', 'inner', '.git'), { recursive: true });
  return work;
}

test('discoverRepos finds repos level by level, skipping dependency, hidden and excluded folders', async () => {
  const work = layout();
  const found = await discoverRepos(fs, { root: work, maxDepth: 3, exclude: [/^archive(\/|$)/] });
  expect(found.map((path) => path.slice(work.length + 1))).toEqual([
    'payments/ledger',
    'payments/orders',
    'web',
  ]);
  expect(await discoverRepos(fs, { root: join(work, 'web'), maxDepth: 2, exclude: [] })).toEqual([
    join(work, 'web'),
  ]);
  expect(await discoverRepos(fs, { root: join(dir, 'missing'), maxDepth: 2, exclude: [] })).toEqual(
    [],
  );
});

test('buildRegistry merges explicit repos and roots, with groups, unique slugs and problems', async () => {
  const work = layout();
  const config = configSchema.parse({
    roots: [{ path: work, exclude: ['archive/**'] }, { path: join(dir, 'nowhere') }],
    repos: [
      { name: 'Orders', path: join(work, 'web'), group: 'front' },
      { name: 'ghost', path: join(dir, 'ghost') },
      { name: 'file', path: join(dir, 'file.txt') },
    ],
  });
  writeFileSync(join(dir, 'file.txt'), 'x');
  const { registry, problems } = await buildRegistry(fs, config, '/home/me');
  expect(registry.list().map((repo) => [repo.slug, repo.group])).toEqual([
    ['orders', 'front'],
    ['ledger', 'payments'],
    ['payments-orders', 'payments'],
  ]);
  expect(registry.get('ORDERS')?.root).toContain('web');
  expect(problems.join('\n')).toContain('nowhere not found');
  expect(problems.join('\n')).toContain('"ghost"');
  expect(problems.join('\n')).toContain('not a folder');
});

test('a fixed group from the root config wins', async () => {
  const work = layout();
  const config = configSchema.parse({ roots: [{ path: work, group: 'all', maxDepth: 1 }] });
  const { registry } = await buildRegistry(fs, config, '/home/me');
  expect(registry.list().map((repo) => `${repo.slug}:${repo.group}`)).toEqual(['web:all']);
});

test('slugify, expandHome and createRegistry', () => {
  expect(slugify('Orders Service (v2)')).toBe('orders-service-v2');
  expect(slugify('...')).toBe('repo');
  expect(expandHome('~', '/home/me')).toBe('/home/me');
  expect(expandHome('~/work', '/home/me')).toBe('/home/me/work');
  expect(expandHome('/abs', '/home/me')).toBe('/abs');
  const registry = createRegistry([{ slug: 'a', root: '/a', group: '' }]);
  expect(registry.get('A')?.root).toBe('/a');
  expect(registry.get('b')).toBeUndefined();
});

test('slug clashes without a group get a number', async () => {
  dir = mkdtempSync(join(tmpdir(), 'codebase-mcp-registry-'));
  for (const path of ['one/api', 'two/api']) mkdirSync(join(dir, path), { recursive: true });
  const config = configSchema.parse({
    repos: [
      { name: 'api', path: join(dir, 'one/api') },
      { name: 'api', path: join(dir, 'two/api') },
      { name: 'dup', path: join(dir, 'one/api') },
    ],
  });
  const { registry } = await buildRegistry(fs, config, '/home/me');
  expect(registry.list().map((repo) => repo.slug)).toEqual(['api', 'api-2']);
});
