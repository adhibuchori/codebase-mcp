/**
 * Builds what indexing needs from plain settings, so a worker thread (which shares nothing with the
 * server) and the inline runner (tests, `bun run index`) assemble exactly the same pipeline.
 */
import { mkdirSync } from 'node:fs';
import { createInventory } from '../adapters/fs/inventory.ts';
import { createNodeFileSystem } from '../adapters/fs/node-file-system.ts';
import { listGitFiles } from '../adapters/git/git-reader.ts';
import { openShardWriter } from '../adapters/index/shard-writer.ts';
import { loadSqlite } from '../adapters/index/sqlite.ts';
import { createTreeSitterParser } from '../adapters/parse/tree-sitter-parser.ts';
import type { Repo } from '../core/model/domain.types.ts';
import { globToRegex } from '../core/text/glob.ts';
import { createLanguageRegistry } from '../languages/registry/language-registry.ts';
import type { Logger } from '../ports/runtime.ts';
import { analyzeFile } from './analyze-file.ts';
import { indexRepo, type IndexRepoDeps } from './index-repo.ts';
import type { IndexJobRunner, IndexSettings } from './protocol.types.ts';

export function shardPathFor(indexDir: string, repo: Pick<Repo, 'slug'>): string {
  return `${indexDir}/${repo.slug}.sqlite`;
}

export async function createIndexDeps(
  settings: IndexSettings,
  logger: Logger,
): Promise<IndexRepoDeps> {
  mkdirSync(settings.indexDir, { recursive: true });
  const fs = createNodeFileSystem();
  const open = await loadSqlite();
  const git = { baseEnv: settings.gitEnv, timeoutMs: settings.gitTimeoutMs };
  const inventory = createInventory({
    fs,
    listGitFiles: (root) => listGitFiles(git, root),
    blocked: settings.blocked.map((source) => new RegExp(source, 'i')),
    exclude: settings.exclude.map(globToRegex),
  });
  const languages = createLanguageRegistry();
  const parser = createTreeSitterParser({
    grammarsDir: settings.grammarsDir,
    queriesDir: settings.queriesDir,
    logger,
  });
  return {
    inventory,
    fs,
    analyze: (path, text) => analyzeFile(path, text, { languages, parser }),
    openWriter: (repo) => openShardWriter(open, shardPathFor(settings.indexDir, repo)),
    maxFileBytes: settings.maxFileBytes,
    clock: { now: () => Date.now() },
  };
}

/** Runs index jobs on the calling thread, one after another. */
export function createInlineRunner(deps: IndexRepoDeps): IndexJobRunner {
  return {
    run: (repo, onProgress) => indexRepo(repo, deps, onProgress),
    close: async () => {},
  };
}
