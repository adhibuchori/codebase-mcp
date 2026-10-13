import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Repo } from '../../../core/model/domain.types.ts';
import { trigramMatch } from '../../../core/query/trigrams.ts';
import type { FileRecord, IndexStatus } from '../../../ports/index-store.ts';
import { createShardPool } from '../shard-pool.ts';
import { openShardWriter } from '../shard-writer.ts';
import { loadSqlite, type OpenSqlite } from '../sqlite.ts';

let open: OpenSqlite;
let dir = '';
const repo: Repo = { slug: 'orders', root: '/repos/orders', group: '' };

beforeAll(async () => {
  open = await loadSqlite();
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

function record(path: string, content: string, extra: Partial<FileRecord> = {}): FileRecord {
  return {
    path,
    fingerprint: `${content.length}:1`,
    size: content.length,
    lang: 'java',
    lines: content.split('\n').length,
    flags: 0,
    content,
    symbols: [],
    routes: [],
    ...extra,
  };
}

function shard(): string {
  dir = mkdtempSync(join(tmpdir(), 'codebase-mcp-shard-'));
  return join(dir, 'orders.sqlite');
}

describe('writer and pool', () => {
  test('stores files, symbols and routes, and answers every read', () => {
    const path = shard();
    const writer = openShardWriter(open, path);
    const symbols = [
      {
        name: 'OrderService',
        kind: 'class',
        line: 3,
        endLine: 30,
        container: '',
        signature: 'public class OrderService',
      },
    ];
    const routes = [
      {
        kind: 'http' as const,
        role: 'handler' as const,
        method: 'POST',
        pattern: '/api/orders/{id}/cancel',
        line: 9,
        framework: 'spring',
      },
    ];
    writer.upsert([
      record('src/OrderService.java', 'class OrderService { cancel() }', { symbols, routes }),
      record('README.md', 'Orders service docs', { lang: 'config' }),
    ]);
    writer.setMeta({ status: 'ready', files: '2', bytes: '50', indexed_at: '1000' });
    expect(writer.fingerprints().get('README.md')).toBe('19:1');
    writer.close();
    const pool = createShardPool({
      open,
      shardPath: () => path,
      exists: existsSync,
      liveStatus: () => undefined,
      maxOpen: 2,
    });
    expect(pool.status(repo)).toMatchObject({
      state: 'ready',
      files: 2,
      bytes: 50,
      indexedAt: 1000,
      progress: 1,
    });
    expect(pool.candidates(repo, trigramMatch(['OrderService']), 10)).toEqual([
      'src/OrderService.java',
    ]);
    expect(pool.files(repo)?.map((file) => file.path)).toEqual([
      'README.md',
      'src/OrderService.java',
    ]);
    expect(pool.file(repo, 'README.md')?.lang).toBe('config');
    expect(pool.file(repo, 'missing')).toBeNull();
    expect(pool.pathsNamed(repo, 'orderservice.java', 5)).toEqual(['src/OrderService.java']);
    expect(pool.symbolsInFile(repo, 'src/OrderService.java')?.[0]?.name).toBe('OrderService');
    expect(pool.symbolsInFile(repo, 'nope.java')).toBeNull();
    expect(
      pool.findSymbols(repo, { name: 'orderservice', match: 'exact', kind: '', limit: 5 })[0]?.path,
    ).toBe('src/OrderService.java');
    expect(
      pool.findSymbols(repo, { name: 'Order', match: 'prefix', kind: 'class', limit: 5 }),
    ).toHaveLength(1);
    expect(
      pool.findSymbols(repo, { name: 'derServ', match: 'contains', kind: '', limit: 5 }),
    ).toHaveLength(1);
    expect(pool.findSymbols(repo, { name: 'de', match: 'contains', kind: '', limit: 5 })).toEqual(
      [],
    );
    expect(pool.routes(repo, ['http'])[0]).toMatchObject({
      pattern: '/api/orders/{id}/cancel',
      repo: 'orders',
      path: 'src/OrderService.java',
    });
    expect(pool.routes(repo, [])).toEqual([]);
    pool.closeAll();
  });

  test('updating a file replaces its rows; removing it drops them', () => {
    const path = shard();
    const writer = openShardWriter(open, path);
    const symbol = {
      name: 'Old',
      kind: 'class',
      line: 1,
      endLine: 1,
      container: '',
      signature: '',
    };
    writer.upsert([record('a.java', 'class Old {}', { symbols: [symbol] })]);
    writer.upsert([
      record('a.java', 'class Renamed {}', { symbols: [{ ...symbol, name: 'Renamed' }] }),
    ]);
    writer.setMeta({ status: 'ready', indexed_at: '5' });
    const pool = createShardPool({
      open,
      shardPath: () => path,
      exists: existsSync,
      liveStatus: () => undefined,
      maxOpen: 4,
    });
    expect(pool.candidates(repo, trigramMatch(['Old {']), 10)).toEqual([]);
    expect(pool.candidates(repo, trigramMatch(['Renamed']), 10)).toEqual(['a.java']);
    expect(pool.findSymbols(repo, { name: 'Old', match: 'exact', kind: '', limit: 5 })).toEqual([]);
    writer.remove(['a.java', 'never-indexed.java']);
    pool.invalidate('orders');
    expect(pool.files(repo)).toEqual([]);
    expect(pool.candidates(repo, trigramMatch(['Renamed']), 10)).toEqual([]);
    for (let i = 0; i < 600; i++) writer.upsert([record(`f${i}.txt`, `content ${i}`)]);
    writer.close();
    pool.closeAll();
  });

  test('a shard is unusable until its first run completes, and live state wins', () => {
    const path = shard();
    const writer = openShardWriter(open, path);
    writer.setMeta({ status: 'indexing' });
    writer.close();
    let live: IndexStatus | undefined;
    const pool = createShardPool({
      open,
      shardPath: () => path,
      exists: existsSync,
      liveStatus: () => live,
      maxOpen: 1,
    });
    expect(pool.status(repo).state).toBe('missing');
    expect(pool.candidates(repo, '"abc"', 5)).toBeNull();
    live = { state: 'ready', files: 1, bytes: 1, indexedAt: 9, progress: 1, message: '' };
    expect(pool.status(repo)).toBe(live);
    expect(pool.candidates(repo, '"abc"', 5)).toEqual([]);
    const other: Repo = { slug: 'other', root: '/x', group: '' };
    expect(pool.files(other)).toEqual([]);
    expect(pool.files(repo)).toEqual([]);
    pool.closeAll();
  });

  test('no shard file means missing and empty answers', () => {
    const path = join(shard(), '..', 'absent.sqlite');
    const pool = createShardPool({
      open,
      shardPath: () => path,
      exists: existsSync,
      liveStatus: () => undefined,
      maxOpen: 2,
    });
    expect(pool.status(repo).state).toBe('missing');
    expect(pool.files(repo)).toBeNull();
    expect(pool.findSymbols(repo, { name: 'x', match: 'exact', kind: '', limit: 1 })).toEqual([]);
    expect(pool.routes(repo, ['http'])).toEqual([]);
  });
});
