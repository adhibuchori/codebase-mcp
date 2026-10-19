/** The pieces the composition root assembles: index settings, the indexing stack, the engine deps. */
import { existsSync } from 'node:fs';
import { cpus } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { createInventory } from '../adapters/fs/inventory.ts';
import { createGitReader, listGitFiles } from '../adapters/git/git-reader.ts';
import { createGitSwitcher } from '../adapters/git/git-switcher.ts';
import { createShardPool, type ShardPool } from '../adapters/index/shard-pool.ts';
import { loadSqlite } from '../adapters/index/sqlite.ts';
import { createTreeSitterParser } from '../adapters/parse/tree-sitter-parser.ts';
import { createWorkerRunner } from '../adapters/runtime/worker-pool.ts';
import { createJsSearcher } from '../adapters/search/js-searcher.ts';
import { createRipgrepSearcher } from '../adapters/search/ripgrep-searcher.ts';
import type { AppConfig } from '../config/config-schema.ts';
import type { Repo } from '../core/model/domain.types.ts';
import { tokensToChars } from '../core/output/budget.ts';
import { parseBranchSwitch } from '../core/security/branch-switch.ts';
import { globToRegex } from '../core/text/glob.ts';
import type { EngineDeps } from '../engine/engine-deps.types.ts';
import { createCoordinator, type IndexCoordinator } from '../indexer/coordinator.ts';
import { gitStateFingerprint } from '../indexer/freshness.ts';
import { createIndexDeps, createInlineRunner, shardPathFor } from '../indexer/index-deps.ts';
import type { IndexJobRunner, IndexSettings } from '../indexer/protocol.types.ts';
import { createLanguageRegistry } from '../languages/registry/language-registry.ts';
import type { FileSystem } from '../ports/file-system.ts';
import type { Logger, RepoRegistry } from '../ports/runtime.ts';
import type { RuntimeOptions } from './runtime-options.types.ts';

const GIT_TIMEOUT_MS = 20_000;

function indexSettings(options: RuntimeOptions, config: AppConfig): IndexSettings {
  return {
    indexDir: isAbsolute(config.index.dir)
      ? config.index.dir
      : join(options.projectDir, config.index.dir),
    maxFileBytes: config.limits.maxFileBytes,
    blocked: config.blocked,
    exclude: config.exclude,
    grammarsDir: join(options.projectDir, 'assets/grammars'),
    queriesDir: join(options.projectDir, 'assets/queries'),
    gitEnv: options.childEnv,
    gitTimeoutMs: GIT_TIMEOUT_MS,
  };
}

async function makeRunner(
  options: RuntimeOptions,
  settings: IndexSettings,
  logger: Logger,
): Promise<IndexJobRunner> {
  if (options.indexRunner === 'inline')
    return createInlineRunner(await createIndexDeps(settings, logger));
  const size = Math.max(1, Math.min(4, Math.floor(cpus().length / 2)));
  return createWorkerRunner({
    size,
    entry: new URL('../indexer/worker-entry.ts', import.meta.url),
    settings,
  });
}

export interface Indexing {
  readonly pool: ShardPool;
  readonly runner: IndexJobRunner;
  readonly coordinator: IndexCoordinator;
}

export async function createIndexing(input: {
  options: RuntimeOptions;
  config: AppConfig;
  registry: RepoRegistry;
  fs: FileSystem;
  logger: Logger;
}): Promise<Indexing> {
  const settings = indexSettings(input.options, input.config);
  const holder: { coordinator?: IndexCoordinator } = {};
  const pool = createShardPool({
    open: await loadSqlite(),
    shardPath: (repo) => shardPathFor(settings.indexDir, repo),
    /* With the index off, shards left by an earlier run are never refreshed, so they are not read either. */
    exists: input.config.index.enabled ? existsSync : () => false,
    liveStatus: (slug) => holder.coordinator?.live(slug),
    maxOpen: 48,
  });
  const runner = await makeRunner(input.options, settings, input.logger);
  const coordinator = createCoordinator({
    repos: input.registry,
    runner,
    fingerprint: (repo) => gitStateFingerprint(input.fs, repo.root),
    onIndexed: (repo) => pool.invalidate(repo.slug),
    clock: { now: () => Date.now() },
    logger: input.logger,
    concurrency: 2,
    refreshMs: input.config.index.refreshSeconds * 1000,
    rescanMs: input.config.index.rescanMinutes * 60_000,
  });
  holder.coordinator = coordinator;
  return { pool, runner, coordinator };
}

export interface EngineInput {
  readonly options: RuntimeOptions;
  readonly config: AppConfig;
  readonly registry: RepoRegistry;
  readonly fs: FileSystem;
  readonly logger: Logger;
  readonly pool: ShardPool;
  readonly reindex: (repo: Repo) => void;
  readonly rgPath: string | null;
  readonly blocked: readonly RegExp[];
}

function limitsOf(config: AppConfig): EngineDeps['limits'] {
  return {
    maxResponseChars: tokensToChars(config.limits.maxResponseTokens),
    maxFileBytes: config.limits.maxFileBytes,
    searchTimeoutMs: config.limits.searchTimeoutMs,
    maxReadLines: config.limits.maxReadLines,
  };
}

function ripgrepSearcher(input: EngineInput): EngineDeps['rg'] {
  if (!input.rgPath) return null;
  const { config, blocked } = input;
  return createRipgrepSearcher({
    rgPath: input.rgPath,
    maxFileBytes: config.limits.maxFileBytes,
    exclude: config.exclude,
    blocked,
  });
}

export function createEngineDeps(input: EngineInput): EngineDeps {
  const { config, fs, blocked } = input;
  const git = { baseEnv: input.options.childEnv, timeoutMs: GIT_TIMEOUT_MS };
  const inventory = createInventory({
    fs,
    listGitFiles: (root) => listGitFiles(git, root),
    blocked,
    exclude: config.exclude.map(globToRegex),
  });
  const settings = indexSettings(input.options, config);
  return {
    repos: input.registry,
    fs,
    index: input.pool,
    inventory,
    rg: ripgrepSearcher(input),
    js: createJsSearcher({ fs, inventory, maxFileBytes: config.limits.maxFileBytes }),
    git: createGitReader(git, blocked),
    switcher: createGitSwitcher(git),
    branchSwitch: parseBranchSwitch(input.options.branchSwitchEnv),
    reindex: input.reindex,
    parser: createTreeSitterParser({
      grammarsDir: settings.grammarsDir,
      queriesDir: settings.queriesDir,
      logger: input.logger,
    }),
    languages: createLanguageRegistry(),
    clock: { now: () => Date.now() },
    logger: input.logger,
    limits: limitsOf(config),
    blocked,
    loggerNames: config.logging.loggerNames,
  };
}
