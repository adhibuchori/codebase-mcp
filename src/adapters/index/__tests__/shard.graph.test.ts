/** The call-graph side of a shard: refs, origins, packages, schema upgrades, and the pool size. */
import { afterEach, beforeAll, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EMPTY_GRAPH } from '../../../core/graph/file-graph.ts';
import type { Repo } from '../../../core/model/domain.types.ts';
import type { FileRecord } from '../../../ports/index-store.ts';
import { createShardPool, shardPoolSize } from '../shard-pool.ts';
import { openShardWriter } from '../shard-writer.ts';
import { loadSqlite, type OpenSqlite } from '../sqlite.ts';

let open: OpenSqlite;
let dir = '';
const repo: Repo = { slug: 'orders', root: '/repos/orders', group: '' };

beforeAll(async () => {
  open = await loadSqlite();
});

/* Bun 1.3 on Windows panics on rmSync(''): only remove a folder a test made. */
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = '';
});

function record(path: string, content: string, extra: Partial<FileRecord> = {}): FileRecord {
  return {
    path,
    fingerprint: `${content.length}:1`,
    size: content.length,
    lang: 'java',
    lines: 1,
    flags: 0,
    content,
    symbols: [],
    routes: [],
    graph: EMPTY_GRAPH,
    ...extra,
  };
}

function shard(): string {
  dir = mkdtempSync(join(tmpdir(), 'codebase-mcp-shard-graph-'));
  return join(dir, 'orders.sqlite');
}

test('the pool keeps every repo open, within 48 and 512 shards', () => {
  expect(shardPoolSize(4)).toBe(48);
  expect(shardPoolSize(369)).toBe(385);
  expect(shardPoolSize(5000)).toBe(512);
});

test('graph rows round-trip, and a shard from an older schema is not read until rebuilt', () => {
  const path = shard();
  const writer = openShardWriter(open, path);
  const symbols = [
    { name: 'Svc', kind: 'class', line: 1, endLine: 9, container: '', signature: '' },
    { name: 'run', kind: 'method', line: 2, endLine: 8, container: 'Svc', signature: '' },
    { name: 'run', kind: 'method', line: 3, endLine: 4, container: 'Svc', signature: '' },
  ];
  const ref = { kind: 'call' as const, receiver: 'client', scope: 'com.acme.Client', line: 5 };
  const graph = {
    pkg: 'com.acme',
    imports: [],
    refs: [
      { ...ref, name: 'pay', origin: 'Svc.run' },
      { ...ref, name: 'boot', origin: '', receiver: '', scope: '' },
      { ...ref, name: 'gone', origin: 'Missing.symbol' },
    ],
  };
  writer.upsert([record('src/Svc.java', 'class Svc {}', { symbols, graph })]);
  writer.setMeta({ status: 'ready', indexed_at: '1000' });
  writer.close();
  const pool = createShardPool({
    open,
    shardPath: () => path,
    exists: existsSync,
    liveStatus: () => undefined,
    maxOpen: 4,
  });
  const named = pool.refsNamed(repo, { name: 'pay', kinds: ['call'], limit: 5 });
  expect(named).toEqual([
    { ...ref, name: 'pay', origin: 'Svc.run', repo: 'orders', path: 'src/Svc.java' },
  ]);
  expect(pool.refsNamed(repo, { name: 'pay', kinds: [], limit: 5 })).toEqual([]);
  expect(pool.refsFrom(repo, 'src/Svc.java', 'Svc.run').map((r) => r.name)).toEqual(['pay']);
  expect(pool.refsFrom(repo, 'src/Svc.java', '').map((r) => r.name)).toEqual(['boot', 'gone']);
  expect(pool.filePackage(repo, 'src/Svc.java')).toBe('com.acme');
  expect(pool.filePackage(repo, 'src/Nope.java')).toBeNull();
  pool.closeAll();
  const old = open(path, { readonly: false });
  old.run("UPDATE meta SET value = '1' WHERE key = 'schema_version'");
  old.close();
  const fresh = createShardPool({
    open,
    shardPath: () => path,
    exists: existsSync,
    liveStatus: () => undefined,
    maxOpen: 4,
  });
  expect(fresh.refsNamed(repo, { name: 'pay', kinds: ['call'], limit: 5 })).toEqual([]);
  expect(fresh.status(repo).state).toBe('missing');
  fresh.closeAll();
});
