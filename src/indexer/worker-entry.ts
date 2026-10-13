/**
 * Entry of an indexer worker thread. Parsing and writing a large repo is CPU work; doing it here keeps
 * the HTTP server responsive. The pipeline is built once per worker from the first job's settings.
 */
import { parentPort } from 'node:worker_threads';
import { createConsoleLogger } from '../adapters/logger/console-logger.ts';
import { createIndexDeps } from './index-deps.ts';
import { indexRepo, type IndexRepoDeps } from './index-repo.ts';
import type { IndexJobMessage, WorkerReply } from './protocol.types.ts';

const logger = createConsoleLogger('warn');
let deps: Promise<IndexRepoDeps> | undefined;

function isJob(value: unknown): value is IndexJobMessage {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'index';
}

function reply(message: WorkerReply): void {
  parentPort?.postMessage(message, []);
}

async function handle(job: IndexJobMessage): Promise<void> {
  try {
    deps ??= createIndexDeps(job.settings, logger);
    const outcome = await indexRepo(job.repo, await deps, (done, total) =>
      reply({ type: 'progress', id: job.id, done, total }),
    );
    reply({ type: 'done', id: job.id, outcome });
  } catch (error) {
    reply({
      type: 'failed',
      id: job.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

parentPort?.on('message', (message: unknown) => {
  if (isJob(message)) void handle(message);
});
