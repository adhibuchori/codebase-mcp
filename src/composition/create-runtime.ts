/**
 * The composition root: the one place that picks concrete adapters for the ports and hands them to
 * the engine, the indexer and the tools. Everything it builds is closed again by Runtime.close().
 */
import { createNodeFileSystem } from '../adapters/fs/node-file-system.ts';
import { createConsoleLogger } from '../adapters/logger/console-logger.ts';
import { bundledRipgrep, locateRipgrep } from '../adapters/search/locate-ripgrep.ts';
import { loadConfig } from '../config/load-config.ts';
import { buildRegistry } from '../config/repo-registry.ts';
import { createCatalog } from '../engine/catalog.ts';
import type { IndexCoordinator } from '../indexer/coordinator.ts';
import type { FileSystem } from '../ports/file-system.ts';
import type { ToolContext } from '../tools/registry/define-tool.ts';
import { compileBlocked } from './compile-blocked.ts';
import { createEngineDeps, createIndexing } from './runtime-parts.ts';
import type { RuntimeOptions } from './runtime-options.types.ts';

export interface Runtime {
  readonly context: ToolContext;
  readonly coordinator: IndexCoordinator;
  readonly indexEnabled: boolean;
  readonly problems: readonly string[];
  readonly configSource: string;
  readonly ripgrep: string | null;
  close(): Promise<void>;
}

/** Config, repos and ripgrep: everything decided before any adapter is built. */
async function settle(options: RuntimeOptions, fs: FileSystem) {
  const loaded = await loadConfig(fs, {
    path: options.configPath,
    reposEnv: options.reposEnv,
    extraBlockedEnv: options.extraBlockedEnv,
  });
  const { registry, problems } = await buildRegistry(fs, loaded.config, options.home);
  const rgPath = await locateRipgrep({
    configured: options.rgPath,
    disabled: options.disableRipgrep,
    bundled: bundledRipgrep,
    cwd: options.projectDir,
  });
  return {
    config: loaded.config,
    source: loaded.source,
    registry,
    problems,
    blocked: compileBlocked(loaded.config.blocked),
    rgPath,
  };
}

export async function createRuntime(options: RuntimeOptions): Promise<Runtime> {
  const fs = createNodeFileSystem();
  const logger = createConsoleLogger(options.logLevel, options.writeLog);
  const { config, source, registry, problems, blocked, rgPath } = await settle(options, fs);
  const indexing = await createIndexing({ options, config, registry, fs, logger });
  const deps = createEngineDeps({
    options,
    config,
    registry,
    fs,
    logger,
    pool: indexing.pool,
    reindex: config.index.enabled ? (repo) => indexing.coordinator.enqueue(repo) : () => {},
    rgPath,
    blocked,
  });
  return {
    context: { deps, catalog: createCatalog(deps), budget: deps.limits.maxResponseChars },
    coordinator: indexing.coordinator,
    indexEnabled: config.index.enabled,
    problems,
    configSource: source,
    ripgrep: rgPath,
    close: async () => {
      indexing.coordinator.stop();
      await indexing.runner.close();
      indexing.pool.closeAll();
    },
  };
}
