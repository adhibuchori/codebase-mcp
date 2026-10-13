import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { globToRegex } from '../../../core/text/glob.ts';
import { createInventory } from '../inventory.ts';
import { createNodeFileSystem } from '../node-file-system.ts';

const fs = createNodeFileSystem();
let dir = '';

afterEach(() => rmSync(dir, { recursive: true, force: true }));

function tree(): string {
  dir = mkdtempSync(join(tmpdir(), 'codebase-mcp-inventory-'));
  for (const path of [
    'src/a.ts',
    'src/deep/b.ts',
    'node_modules/x/index.js',
    'build/out.js',
    'docs/readme.md',
    'certs/key.pem',
  ]) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), 'x');
  }
  symlinkSync(join(dir, 'src'), join(dir, 'link'), 'junction');
  return dir;
}

test('walks a folder that is not a git repo, skipping dependencies, builds, links and secrets', async () => {
  const root = tree();
  const inventory = createInventory({
    fs,
    listGitFiles: async () => null,
    blocked: [],
    exclude: [globToRegex('docs/**')],
  });
  const entries = await inventory.list({ slug: 'x', root, group: '' });
  expect(entries.map((entry) => entry.path).toSorted()).toEqual(['src/a.ts', 'src/deep/b.ts']);
  expect(entries[0]?.size).toBe(1);
});

test('uses the git list when there is one, and drops files that no longer exist', async () => {
  const root = tree();
  const inventory = createInventory({
    fs,
    listGitFiles: async () => ['src/a.ts', 'gone.ts', 'certs\\key.pem', 'src'],
    blocked: [/^a\.ts$/],
    exclude: [],
  });
  expect(await inventory.list({ slug: 'x', root, group: '' })).toEqual([]);
});

test('a folder that cannot be read is skipped, not fatal', async () => {
  const root = tree();
  const flaky = {
    ...fs,
    readDir: async (path: string) =>
      path.endsWith('/deep') ? Promise.reject(new Error('EACCES')) : fs.readDir(path),
  };
  const inventory = createInventory({
    fs: flaky,
    listGitFiles: async () => null,
    blocked: [],
    exclude: [],
  });
  const paths = (await inventory.list({ slug: 'x', root, group: '' })).map((entry) => entry.path);
  expect(paths).toContain('src/a.ts');
  expect(paths).not.toContain('src/deep/b.ts');
});

test('node file system basics', async () => {
  const root = tree();
  expect(await fs.realpath(join(root, 'link'))).toBe(await fs.realpath(join(root, 'src')));
  expect(await fs.realpath(join(root, 'missing'))).toBeNull();
  expect(await fs.stat(join(root, 'missing'))).toBeNull();
  expect((await fs.stat(join(root, 'src')))?.isDirectory).toBe(true);
  expect(await fs.readText(join(root, 'src/a.ts'))).toBe('x');
  expect([...(await fs.readHead(join(root, 'src/a.ts'), 10))]).toEqual([120]);
  const entries = await fs.readDir(root);
  expect(entries.find((entry) => entry.name === 'link')?.isSymlink).toBe(true);
});
