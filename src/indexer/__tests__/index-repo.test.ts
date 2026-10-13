import { afterEach, beforeAll, expect, test } from 'bun:test';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInventory } from '../../adapters/fs/inventory.ts';
import { createNodeFileSystem } from '../../adapters/fs/node-file-system.ts';
import { openShardWriter } from '../../adapters/index/shard-writer.ts';
import { createShardPool } from '../../adapters/index/shard-pool.ts';
import { loadSqlite, type OpenSqlite } from '../../adapters/index/sqlite.ts';
import type { Repo } from '../../core/model/domain.types.ts';
import { trigramMatch } from '../../core/query/trigrams.ts';
import type { IndexWriter } from '../../ports/index-store.ts';
import type { Analysis } from '../analyze-file.ts';
import { fingerprint, indexRepo, type IndexRepoDeps } from '../index-repo.ts';
import { rejectionOf } from '../../testing/helpers/rejection.ts';

const fs = createNodeFileSystem();
let open: OpenSqlite;
let dir = '';
let analysed: string[] = [];

beforeAll(async () => {
  open = await loadSqlite();
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

function setup(): { repo: Repo; deps: IndexRepoDeps; shard: string } {
  dir = mkdtempSync(join(tmpdir(), 'codebase-mcp-index-'));
  const root = join(dir, 'repo');
  const repo: Repo = { slug: 'repo', root, group: '' };
  const shard = join(dir, 'repo.sqlite');
  analysed = [];
  const analyze = async (path: string, text: string): Promise<Analysis> => {
    analysed.push(path);
    return {
      lang: 'java',
      lines: text.split('\n').length,
      flags: 0,
      symbols: [
        { name: 'Order', kind: 'class', line: 1, endLine: 1, container: '', signature: '' },
      ],
      routes: [],
    };
  };
  const deps: IndexRepoDeps = {
    inventory: createInventory({ fs, listGitFiles: async () => null, blocked: [], exclude: [] }),
    fs,
    analyze,
    openWriter: () => openShardWriter(open, shard),
    maxFileBytes: 1000,
    clock: { now: () => 1000 },
  };
  return { repo, deps, shard };
}

function write(repo: Repo, path: string, text: string | Uint8Array): void {
  const full = join(repo.root, path);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, text);
}

test('indexes changed files only, drops removed ones, and keeps binaries out of the content index', async () => {
  const { repo, deps, shard } = setup();
  write(repo, 'src/Order.java', 'class Order { cancel() }');
  write(repo, 'big.txt', 'x'.repeat(2000));
  write(repo, 'image.png', new Uint8Array([137, 80, 0, 71]));
  const progress: number[] = [];
  const first = await indexRepo(repo, deps, (done) => progress.push(done));
  expect(first).toMatchObject({ files: 2, changed: 2, removed: 0, ms: 0 });
  expect(analysed).toEqual(['src/Order.java']);
  expect(progress).toEqual([2]);
  const pool = createShardPool({
    open,
    shardPath: () => shard,
    exists: () => true,
    liveStatus: () => undefined,
    maxOpen: 1,
  });
  expect(pool.candidates(repo, trigramMatch(['cancel']), 5)).toEqual(['src/Order.java']);
  expect(pool.file(repo, 'image.png')?.lang).toBe('binary');
  pool.closeAll();

  analysed = [];
  const second = await indexRepo(repo, deps, () => {});
  expect(second).toMatchObject({ changed: 0, removed: 0 });
  expect(analysed).toEqual([]);

  rmSync(join(repo.root, 'image.png'));
  appendFileSync(join(repo.root, 'src/Order.java'), ' refund()');
  const third = await indexRepo(repo, deps, () => {});
  expect(third).toMatchObject({ files: 1, changed: 1, removed: 1 });
});

test('a failure marks the shard failed and is rethrown', async () => {
  const { repo, deps, shard } = setup();
  write(repo, 'a.txt', 'x');
  const failing: IndexRepoDeps = {
    ...deps,
    inventory: { list: async () => Promise.reject(new Error('disk gone')) },
  };
  expect((await rejectionOf(indexRepo(repo, failing, () => {}))).message).toContain('disk gone');
  const writer: IndexWriter = openShardWriter(open, shard);
  writer.close();
  const db = open(shard, { readonly: true });
  expect(db.get("SELECT value FROM meta WHERE key = 'status'")?.['value']).toBe('failed');
  db.close();
});

test('a file that cannot be read is skipped, not fatal', async () => {
  const { repo, deps } = setup();
  write(repo, 'ok.txt', 'fine');
  const flaky: IndexRepoDeps = {
    ...deps,
    analyze: async () => Promise.reject(new Error('parser crashed')),
  };
  expect((await indexRepo(repo, flaky, () => {})).changed).toBe(1);
});

test('fingerprint combines size and mtime', () => {
  expect(fingerprint({ size: 10, mtimeMs: 99 })).toBe('10:99');
});
