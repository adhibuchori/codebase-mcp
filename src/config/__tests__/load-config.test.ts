import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNodeFileSystem } from '../../adapters/fs/node-file-system.ts';
import { ConfigError, loadConfig, parseReposEnv } from '../load-config.ts';
import { rejectionOf } from '../../testing/helpers/rejection.ts';

const fs = createNodeFileSystem();
const dirs: string[] = [];
const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'codebase-mcp-config-'));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test('parseReposEnv reads name=path pairs and skips malformed parts', () => {
  expect(parseReposEnv('core=/a/b; web = C:/x/y ;bad;=nope;')).toEqual([
    { name: 'core', path: '/a/b', group: '' },
    { name: 'web', path: 'C:/x/y', group: '' },
  ]);
  expect(parseReposEnv('')).toEqual([]);
});

describe('loadConfig', () => {
  test('reads codebase.config.json and fills the defaults', async () => {
    const path = join(tempDir(), 'codebase.config.json');
    writeFileSync(path, JSON.stringify({ roots: [{ path: '~/work' }], blocked: ['\\.sql$'] }));
    const loaded = await loadConfig(fs, { path, reposEnv: '', extraBlockedEnv: '\\.bak$, ' });
    expect(loaded.source).toBe(path);
    expect(loaded.config.roots[0]).toEqual({ path: '~/work', maxDepth: 3, exclude: [] });
    expect(loaded.config.repos).toEqual([]);
    expect(loaded.config.limits.maxResponseTokens).toBe(6000);
    expect(loaded.config.index.dir).toBe('.cache/index');
    expect(loaded.config.blocked).toEqual(['\\.sql$', '\\.bak$']);
  });

  test('REPOS from .env replaces the roots and repos of the config file, which keeps its settings', async () => {
    const path = join(tempDir(), 'codebase.config.json');
    writeFileSync(
      path,
      JSON.stringify({
        roots: [{ path: '~/work' }],
        repos: [{ name: 'core', path: '/tmp/core' }],
        limits: { maxResponseTokens: 9000 },
      }),
    );
    const loaded = await loadConfig(fs, {
      path,
      reposEnv: 'web=/tmp/web',
      extraBlockedEnv: '',
    });
    expect(loaded.source).toBe(`REPOS in .env (settings from ${path})`);
    expect(loaded.config.roots).toEqual([]);
    expect(loaded.config.repos).toEqual([{ name: 'web', path: '/tmp/web', group: '' }]);
    expect(loaded.config.limits.maxResponseTokens).toBe(9000);
  });

  test('falls back to REPOS from .env when there is no config file', async () => {
    const loaded = await loadConfig(fs, {
      path: join(tempDir(), 'missing.json'),
      reposEnv: 'core=/tmp/core',
      extraBlockedEnv: '',
    });
    expect(loaded.source).toBe('REPOS in .env');
    expect(loaded.config.repos).toEqual([{ name: 'core', path: '/tmp/core', group: '' }]);
  });

  test('explains what is wrong', async () => {
    const dir = tempDir();
    const broken = join(dir, 'broken.json');
    writeFileSync(broken, '{ nope');
    expect(
      (await rejectionOf(loadConfig(fs, { path: broken, reposEnv: '', extraBlockedEnv: '' })))
        .message,
    ).toContain('not valid JSON');
    const invalid = join(dir, 'invalid.json');
    writeFileSync(invalid, JSON.stringify({ roots: [{ path: '' }], unknownKey: true }));
    expect(
      await rejectionOf(loadConfig(fs, { path: invalid, reposEnv: '', extraBlockedEnv: '' })),
    ).toBeInstanceOf(ConfigError);
    expect(
      (
        await rejectionOf(
          loadConfig(fs, { path: join(dir, 'none.json'), reposEnv: '', extraBlockedEnv: '' }),
        )
      ).message,
    ).toContain('bun run setup');
  });
});
