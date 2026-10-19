#!/usr/bin/env bun
/**
 * `bun run bench -- --corpus <folder> [--copies N] [--out file]`: scale benchmark. Every repo under the
 * corpus folder is registered N times under different names (each copy gets its own index shard),
 * so a few real repos stand in for hundreds. Reports index build time and size, then the latency and
 * answer size of typical tool calls across every repo.
 */
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createNodeFileSystem } from '../../src/adapters/fs/node-file-system.ts';
import { createConsoleLogger } from '../../src/adapters/logger/console-logger.ts';
import { bundledRipgrep, locateRipgrep } from '../../src/adapters/search/locate-ripgrep.ts';
import { createEngineDeps, createIndexing } from '../../src/composition/runtime-parts.ts';
import { configSchema } from '../../src/config/config-schema.ts';
import { discoverRepos } from '../../src/config/discover-repos.ts';
import { createRegistry, slugify } from '../../src/config/repo-registry.ts';
import { createCatalog } from '../../src/engine/catalog.ts';
import { testOptions } from '../../src/testing/helpers/test-runtime.ts';
import { buildMcpServer } from '../../src/tools/registry/build-server.ts';
import { percentile } from '../eval/scoring.ts';
import { callTool } from './call-tool.ts';
import { QUERIES } from './queries.ts';

const args = process.argv.slice(2);
const option = (name: string, fallback: string): string =>
  args.includes(name) ? (args[args.indexOf(name) + 1] ?? fallback) : fallback;
const corpus = resolve(option('--corpus', join(process.env['HOME'] ?? '', 'codebase-mcp-corpus')));
const copies = Number(option('--copies', '1'));
const work = mkdtempSync(join(tmpdir(), 'codebase-mcp-bench-'));
const fs = createNodeFileSystem();
const logger = createConsoleLogger('warn');

const roots = await discoverRepos(fs, { root: corpus, maxDepth: 2, exclude: [] });
const repos = roots.flatMap((root) =>
  Array.from({ length: copies }, (_, copy) => ({
    slug: slugify(`${root.split('/').at(-1)}-${copy + 1}`),
    root,
    group: `copy-${copy + 1}`,
  })),
);
const registry = createRegistry(repos);
const config = configSchema.parse({ index: { dir: join(work, 'index') } });
const options = { ...testOptions(join(work, 'none.json')), indexRunner: 'threads' as const };
const indexing = await createIndexing({ options, config, registry, fs, logger });
console.log(`Indexing ${repos.length} repos (${roots.length} real × ${copies})…`);
const started = performance.now();
indexing.coordinator.start();
await indexing.coordinator.idle();
const buildSeconds = (performance.now() - started) / 1000;
const shardBytes = readdirSync(join(work, 'index')).reduce(
  (sum, file) => sum + statSync(join(work, 'index', file)).size,
  0,
);
const sourceBytes = repos.reduce(
  (sum, repo) => sum + (indexing.coordinator.live(repo.slug)?.bytes ?? 0),
  0,
);
const rgPath = await locateRipgrep({
  configured: '',
  disabled: false,
  bundled: bundledRipgrep,
  cwd: work,
});
const deps = createEngineDeps({
  options,
  config,
  registry,
  fs,
  logger,
  pool: indexing.pool,
  reindex: () => {},
  rgPath,
  blocked: [],
});
const context = { deps, catalog: createCatalog(deps), budget: deps.limits.maxResponseChars };
const server = () => buildMcpServer(context, 'bench');

const lines = [
  `| Repos | Source | Index | Index/source | Build |`,
  `| --- | --- | --- | --- | --- |`,
  `| ${repos.length} | ${(sourceBytes / 1e6).toFixed(0)} MB | ${(shardBytes / 1e6).toFixed(0)} MB | ${Math.round((shardBytes / Math.max(1, sourceBytes)) * 100)}% | ${buildSeconds.toFixed(1)} s |`,
  '',
  `| Call | p50 ms | p95 ms | tokens |`,
  `| --- | --- | --- | --- |`,
];
for (const query of QUERIES) {
  const timings: number[] = [];
  let tokens = 0;
  for (let run = 0; run < 5; run++) {
    const begin = performance.now();
    const text = await callTool(server, query.tool, query.args);
    timings.push(Math.round(performance.now() - begin));
    tokens = Math.ceil(text.length / 4);
  }
  lines.push(
    `| ${query.label} | ${percentile(timings, 50)} | ${percentile(timings, 95)} | ${tokens} |`,
  );
}
console.log(lines.join('\n'));
const out = args.includes('--out') ? option('--out', '') : '';
if (out) writeFileSync(out, `${lines.join('\n')}\n`);
indexing.coordinator.stop();
await indexing.runner.close();
indexing.pool.closeAll();
rmSync(work, { recursive: true, force: true });
