#!/usr/bin/env bun
/**
 * Entry point and composition root of the commands: `start` (HTTP, the default), `stdio` and
 * `index`. Runs unchanged on Bun and on Node 22.18+ (TypeScript is stripped natively there).
 */
import { fileURLToPath } from 'node:url';
import packageJson from '../package.json' with { type: 'json' };
import { runtimeLabel } from './adapters/runtime/platform.ts';
import { startHttpServer } from './adapters/runtime/serve.ts';
import { createApp } from './app.ts';
import { bannerLines, strongEnough, USAGE } from './cli/banner.ts';
import { createRuntime, type Runtime } from './composition/create-runtime.ts';
import { describeBranchSwitch } from './core/security/branch-switch.ts';
import { loadEnv, type AppEnv } from './env.ts';
import { handleMcpRequest } from './http/mcp/mcp-transport.ts';
import { createRateLimiter } from './http/middlewares/rate-limit.middleware.ts';
import { buildMcpServer } from './tools/registry/build-server.ts';

const version = packageJson.version;
const projectDir = fileURLToPath(new URL('..', import.meta.url));

function runtimeFor(env: AppEnv): Promise<Runtime> {
  return createRuntime({
    projectDir,
    configPath: env.configPath,
    reposEnv: env.reposEnv,
    extraBlockedEnv: env.extraBlocked,
    branchSwitchEnv: env.branchSwitch,
    rgPath: env.rgPath,
    disableRipgrep: env.disableRipgrep,
    childEnv: env.childEnv,
    logLevel: env.logLevel,
    home: env.home,
    indexRunner: 'threads',
  });
}

async function start(env: AppEnv): Promise<void> {
  if (!strongEnough(env.apiKey))
    throw new Error(
      'MCP_API_KEY is missing or shorter than 24 characters. Run: bun run setup (or bun run gen-key).',
    );
  const runtime = await runtimeFor(env);
  if (runtime.indexEnabled) runtime.coordinator.start();
  const { logger, clock } = runtime.context.deps;
  const app = createApp({
    apiKey: env.apiKey,
    handleMcp: (request, body) =>
      handleMcpRequest(request, body, () => buildMcpServer(runtime.context, version)),
    limiter: createRateLimiter({ limit: 120, windowMs: 60_000, clock }),
    logger,
    clock,
  });
  const server = await startHttpServer({ fetch: app.fetch, port: env.port, hostname: env.host });
  const repos = runtime.context.deps.repos.list();
  for (const line of bannerLines({
    version,
    runtime: runtimeLabel(),
    url: server.url,
    repos,
    configSource: runtime.configSource,
    ripgrep: runtime.ripgrep,
    indexEnabled: runtime.indexEnabled,
    branchSwitch: describeBranchSwitch(runtime.context.deps.branchSwitch),
    problems: runtime.problems,
  }))
    logger.info(line);
  const stop = async (): Promise<void> => {
    await server.close();
    await runtime.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void stop());
  process.once('SIGTERM', () => void stop());
}

async function stdio(env: AppEnv): Promise<void> {
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const runtime = await runtimeFor(env);
  if (runtime.indexEnabled) runtime.coordinator.start();
  await buildMcpServer(runtime.context, version).connect(new StdioServerTransport());
}

async function index(env: AppEnv): Promise<void> {
  const runtime = await runtimeFor(env);
  const { logger } = runtime.context.deps;
  const repos = runtime.context.deps.repos.list();
  logger.info(`Indexing ${repos.length} repos…`);
  runtime.coordinator.start();
  const timer = setInterval(() => {
    const done = repos.filter(
      (repo) => runtime.coordinator.live(repo.slug)?.state === 'ready',
    ).length;
    logger.info(`${done}/${repos.length} repos indexed`);
  }, 5000);
  await runtime.coordinator.idle();
  clearInterval(timer);
  const failed = repos
    .filter((repo) => runtime.coordinator.live(repo.slug)?.state === 'failed')
    .map((repo) => repo.slug);
  logger.info(
    `Done. ${repos.length - failed.length} indexed${failed.length > 0 ? `, failed: ${failed.join(', ')}` : ''}.`,
  );
  await runtime.close();
  process.exit(failed.length > 0 ? 1 : 0);
}

const commands: Readonly<Record<string, (env: AppEnv) => Promise<void>>> = { start, stdio, index };
const command = commands[process.argv[2] ?? 'start'];

if (!command) {
  process.stderr.write(`${USAGE}\n`);
  process.exit(2);
}

try {
  await command(loadEnv(projectDir));
} catch (error) {
  process.stderr.write(`❌ ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
