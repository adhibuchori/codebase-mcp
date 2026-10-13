/**
 * Keeps every repo's index fresh in the background: all repos are queued at start, a cheap git-state
 * check runs every refresh interval, and a full rescan catches unstaged edits. Searches never wait:
 * a repo without a usable shard is searched directly instead.
 */
import { mapLimit } from '../core/async/map-limit.ts';
import type { Repo } from '../core/model/domain.types.ts';
import type { IndexStatus } from '../ports/index-store.ts';
import type { Clock, Logger, RepoRegistry } from '../ports/runtime.ts';
import { describeChange } from './freshness.ts';
import { createJobQueue, type JobEvents } from './job-queue.ts';
import type { IndexJobRunner, IndexOutcome } from './protocol.types.ts';

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

/** Why each repo was queued, and why the job running for it now was started. */
function reasonTracker() {
  const next = new Map<string, string>();
  const current = new Map<string, string>();
  return {
    note: (slug: string, reason: string): void => {
      if (!next.has(slug)) next.set(slug, reason);
    },
    start: (slug: string): void => {
      current.set(slug, next.get(slug) ?? 'requested');
      next.delete(slug);
    },
    of: (slug: string): string => current.get(slug) ?? 'requested',
  };
}

type Reasons = ReturnType<typeof reasonTracker>;

/** A run that changed files is news (info); a run that found nothing to do is detail (debug). */
function logOutcome(logger: Logger, repo: Repo, run: IndexOutcome & { reason: string }): void {
  const { files, changed, removed, ms, reason } = run;
  const fields = { repo: repo.slug, reason, files, changed, removed, ms };
  if (changed + removed > 0) logger.info('indexed', fields);
  else logger.debug('index unchanged', fields);
}

function statusEvents(
  deps: CoordinatorDeps,
  set: (slug: string, change: Partial<IndexStatus>) => void,
  reasons: Reasons,
): JobEvents {
  return {
    started: (repo) => {
      reasons.start(repo.slug);
      set(repo.slug, { state: 'indexing', progress: 0 });
    },
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
      logOutcome(deps.logger, repo, { ...outcome, reason: reasons.of(repo.slug) });
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

/** Checks every repo's git state and queues the ones whose state changed since the last check. */
function gitWatcher(deps: CoordinatorDeps, queue: (repo: Repo, reason: string) => void) {
  const fingerprints = new Map<string, string>();
  return async (): Promise<void> => {
    await mapLimit(deps.repos.list(), 16, async (repo) => {
      const value = await deps.fingerprint(repo);
      const before = fingerprints.get(repo.slug);
      fingerprints.set(repo.slug, value);
      if (before === undefined || before === value) return;
      const parts = describeChange(before, value);
      deps.logger.debug('git state changed', { repo: repo.slug, changed: parts });
      queue(repo, `git: ${parts}`);
    });
  };
}

export function createCoordinator(deps: CoordinatorDeps): IndexCoordinator {
  const states = new Map<string, IndexStatus>();
  const timers: ReturnType<typeof setInterval>[] = [];
  const set = (slug: string, change: Partial<IndexStatus>): void => {
    states.set(slug, { ...(states.get(slug) ?? BLANK), ...change });
  };
  const reasons = reasonTracker();
  const jobs = createJobQueue(deps.runner, deps.concurrency, statusEvents(deps, set, reasons));
  const queue = (repo: Repo, reason: string): void => {
    reasons.note(repo.slug, reason);
    if (jobs.add(repo) === 'queued') set(repo.slug, { state: 'queued', progress: 0 });
  };
  const queueAll = (reason: string): void => {
    const all = deps.repos.list();
    deps.logger.debug(`index ${reason}`, { repos: all.length });
    for (const repo of all) queue(repo, reason);
  };
  const refresh = gitWatcher(deps, queue);
  return {
    start: () => {
      void refresh();
      queueAll('startup');
      every(timers, deps.refreshMs, () => void refresh());
      every(timers, deps.rescanMs, () => queueAll('rescan'));
    },
    stop: () => {
      for (const timer of timers.splice(0)) clearInterval(timer);
      jobs.clear();
    },
    enqueue: (repo) => queue(repo, 'requested'),
    live: (slug) => states.get(slug),
    idle: () => jobs.idle(),
    refresh,
  };
}
