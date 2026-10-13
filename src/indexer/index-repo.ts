/**
 * Indexes one repo incrementally: list the files, compare size:mtime fingerprints with the shard,
 * drop what disappeared, and analyse only what changed, in batches of one transaction each. A
 * second run over an unchanged repo reads no file content at all.
 */
import { chunk, mapLimit } from '../core/async/map-limit.ts';
import type { Repo } from '../core/model/domain.types.ts';
import { looksBinary } from '../core/text/lines.ts';
import type { FileSystem } from '../ports/file-system.ts';
import type { FileRecord, IndexWriter } from '../ports/index-store.ts';
import type { Clock } from '../ports/runtime.ts';
import type { Inventory, InventoryEntry } from '../ports/search.ts';
import type { Analysis } from './analyze-file.ts';
import type { IndexOutcome } from './protocol.types.ts';

export interface IndexRepoDeps {
  readonly inventory: Inventory;
  readonly fs: FileSystem;
  readonly analyze: (path: string, text: string) => Promise<Analysis>;
  readonly openWriter: (repo: Repo) => IndexWriter;
  readonly maxFileBytes: number;
  readonly clock: Clock;
}

const BATCH = 200;
const EMPTY: Analysis = { lang: 'binary', lines: 0, flags: 0, symbols: [], routes: [] };

export function fingerprint(entry: Pick<InventoryEntry, 'size' | 'mtimeMs'>): string {
  return `${entry.size}:${entry.mtimeMs}`;
}

async function readRecord(
  deps: IndexRepoDeps,
  repo: Repo,
  entry: InventoryEntry,
): Promise<FileRecord> {
  const absolute = `${repo.root}/${entry.path}`;
  const binary = looksBinary(await deps.fs.readHead(absolute, 8000));
  const content = binary ? '' : await deps.fs.readText(absolute);
  const analysis = binary ? EMPTY : await deps.analyze(entry.path, content);
  return {
    path: entry.path,
    fingerprint: fingerprint(entry),
    size: entry.size,
    content,
    ...analysis,
  };
}

interface Progress {
  readonly total: number;
  done: number;
  readonly report: (done: number, total: number) => void;
}

async function writeBatches(
  context: { deps: IndexRepoDeps; repo: Repo; writer: IndexWriter },
  batches: readonly InventoryEntry[][],
  progress: Progress,
): Promise<void> {
  const [batch, ...rest] = batches;
  if (!batch) return;
  const records = await mapLimit(batch, 8, async (entry) =>
    readRecord(context.deps, context.repo, entry).catch(() => null),
  );
  context.writer.upsert(records.filter((record): record is FileRecord => record !== null));
  progress.done += batch.length;
  progress.report(progress.done, progress.total);
  await writeBatches(context, rest, progress);
}

interface SyncContext {
  readonly repo: Repo;
  readonly deps: IndexRepoDeps;
  readonly writer: IndexWriter;
}

/** Brings the shard in line with the files on disk: drops removed files, rewrites changed ones. */
async function sync(
  context: SyncContext,
  report: (done: number, total: number) => void,
): Promise<Omit<IndexOutcome, 'ms'>> {
  const { deps, repo, writer } = context;
  const entries = (await deps.inventory.list(repo)).filter(
    (entry) => entry.size <= deps.maxFileBytes,
  );
  const known = writer.fingerprints();
  const current = new Set(entries.map((entry) => entry.path));
  const removed = [...known.keys()].filter((path) => !current.has(path));
  writer.remove(removed);
  const changed = entries.filter((entry) => known.get(entry.path) !== fingerprint(entry));
  await writeBatches(context, chunk(changed, BATCH), { total: changed.length, done: 0, report });
  const bytes = entries.reduce((sum, entry) => sum + entry.size, 0);
  return { files: entries.length, bytes, changed: changed.length, removed: removed.length };
}

export async function indexRepo(
  repo: Repo,
  deps: IndexRepoDeps,
  report: (done: number, total: number) => void,
): Promise<IndexOutcome> {
  const started = deps.clock.now();
  const writer = deps.openWriter(repo);
  try {
    writer.setMeta({ status: 'indexing', started_at: String(started) });
    const outcome = await sync({ deps, repo, writer }, report);
    const finished = deps.clock.now();
    writer.setMeta({
      status: 'ready',
      files: String(outcome.files),
      bytes: String(outcome.bytes),
      indexed_at: String(finished),
      message: '',
    });
    return { ...outcome, ms: finished - started };
  } catch (error) {
    writer.setMeta({
      status: 'failed',
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    writer.close();
  }
}
