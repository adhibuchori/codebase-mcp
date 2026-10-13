/**
 * Keeps every repo's index fresh in the background: all repos are queued at start, a cheap git-state
 * check runs every refresh interval, and a full rescan catches unstaged edits. Searches never wait:
 * a repo without a usable shard is searched directly instead.
 */
import { mapLimit } from '../core/async/map-limit.ts';
import type { Repo } from '../core/model/domain.types.ts';
import type { IndexStatus } from '../ports/index-store.ts';
import type { Clock, Logger, RepoRegistry } from '../ports/runtime.ts';
import { createJobQueue, type JobEvents } from './job-queue.ts';
import type { IndexJobRunner } from './protocol.types.ts';

export interface CoordinatorDeps {
  readonly repos: RepoRegistry;
  readonly runner: IndexJobRunner;
  readonly fingerprint: (repo: Repo) => Promise<string>;
  readonly onIndexed: (repo: Repo) => void;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly concurrency: number;
  readonly refreshMs: number;
  readonly rescanMs: number;
}

export interface IndexCoordinator {
  start(): void;
  stop(): void;
  enqueue(repo: Repo): void;
  live(slug: string): IndexStatus | undefined;
  /** Resolves once nothing is queued or running. */
  idle(): Promise<void>;
  /** Checks every repo's git state now and queues the ones that changed. */
  refresh(): Promise<void>;
}

const BLANK: IndexStatus = {
  state: 'queued',
  files: 0,
  bytes: 0,
  indexedAt: 0,
  progress: 0,
  message: '',
};

function statusEvents(
  deps: CoordinatorDeps,
  set: (slug: string, change: Partial<IndexStatus>) => void,
): JobEvents {
  return {
    started: (repo) => set(repo.slug, { state: 'indexing', progress: 0 }),
    progress: (repo, fraction) => set(repo.slug, { progress: fraction }),
    finished: (repo, outcome) => {
      set(repo.slug, {
        state: 'ready',
        progress: 1,
        files: outcome.files,
        bytes: outcome.bytes,
        indexedAt: deps.clock.now(),
        message: '',
      });
      deps.onIndexed(repo);
      if (outcome.changed + outcome.removed > 0) {
        deps.logger.info('indexed', {
          repo: repo.slug,
          files: outcome.files,
          changed: outcome.changed,
          removed: outcome.removed,
          ms: outcome.ms,
        });
      }
    },
    failed: (repo, error) => {
      set(repo.slug, {
        state: 'failed',
        message: error instanceof Error ? error.message : String(error),
      });
      deps.logger.error('index failed', { repo: repo.slug, error: String(error) });
    },
  };
}

function every(timers: ReturnType<typeof setInterval>[], ms: number, task: () => void): void {
  const timer = setInterval(task, ms);
  timer.unref();
  timers.push(timer);
}

export function createCoordinator(deps: CoordinatorDeps): IndexCoordinator {
  const states = new Map<string, IndexStatus>();
  const fingerprints = new Map<string, string>();
  const timers: ReturnType<typeof setInterval>[] = [];
  const set = (slug: string, change: Partial<IndexStatus>): void => {
    states.set(slug, { ...(states.get(slug) ?? BLANK), ...change });
  };
  const jobs = createJobQueue(deps.runner, deps.concurrency, statusEvents(deps, set));
  const enqueue = (repo: Repo): void => {
    if (jobs.add(repo) === 'queued') set(repo.slug, { state: 'queued', progress: 0 });
  };
  const refresh = async (): Promise<void> => {
    await mapLimit(deps.repos.list(), 16, async (repo) => {
      const value = await deps.fingerprint(repo);
      const before = fingerprints.get(repo.slug);
      fingerprints.set(repo.slug, value);
      if (before !== undefined && before !== value) enqueue(repo);
    });
  };
  return {
    start: () => {
      void refresh();
      for (const repo of deps.repos.list()) enqueue(repo);
      every(timers, deps.refreshMs, () => void refresh());
      every(timers, deps.rescanMs, () => deps.repos.list().forEach(enqueue));
    },
    stop: () => {
      for (const timer of timers.splice(0)) clearInterval(timer);
      jobs.clear();
    },
    enqueue,
    live: (slug) => states.get(slug),
    idle: () => jobs.idle(),
    refresh,
  };
}
