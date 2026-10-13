/**
 * A small job queue for index runs: a few repos at once, no repo queued twice, and a repo that
 * changes while it is being indexed runs once more afterwards.
 */
import type { Repo } from '../core/model/domain.types.ts';
import type { IndexJobRunner, IndexOutcome } from './protocol.types.ts';

export interface JobEvents {
  readonly started: (repo: Repo) => void;
  readonly progress: (repo: Repo, fraction: number) => void;
  readonly finished: (repo: Repo, outcome: IndexOutcome) => void;
  readonly failed: (repo: Repo, error: unknown) => void;
}

export interface JobQueue {
  add(repo: Repo): 'queued' | 'again' | 'already';
  idle(): Promise<void>;
  clear(): void;
}

interface QueueState {
  readonly queue: Repo[];
  readonly active: Set<string>;
  readonly again: Set<string>;
  readonly waiters: (() => void)[];
}

function createPump(
  state: QueueState,
  runner: IndexJobRunner,
  setup: { concurrency: number; events: JobEvents },
): () => void {
  const { events } = setup;
  const settle = (): void => {
    if (state.active.size === 0 && state.queue.length === 0)
      for (const resolve of state.waiters.splice(0)) resolve();
  };
  const run = async (repo: Repo): Promise<void> => {
    state.active.add(repo.slug);
    events.started(repo);
    try {
      events.finished(
        repo,
        await runner.run(repo, (done, total) =>
          events.progress(repo, total > 0 ? done / total : 1),
        ),
      );
    } catch (error) {
      events.failed(repo, error);
    } finally {
      state.active.delete(repo.slug);
      if (state.again.delete(repo.slug)) state.queue.push(repo);
      pump();
    }
  };
  const pump = (): void => {
    while (state.active.size < setup.concurrency && state.queue.length > 0) {
      const next = state.queue.shift();
      if (next) void run(next);
    }
    settle();
  };
  return pump;
}

export function createJobQueue(
  runner: IndexJobRunner,
  concurrency: number,
  events: JobEvents,
): JobQueue {
  const state: QueueState = { queue: [], active: new Set(), again: new Set(), waiters: [] };
  const pump = createPump(state, runner, { concurrency, events });
  return {
    add: (repo) => {
      if (state.active.has(repo.slug)) {
        state.again.add(repo.slug);
        return 'again';
      }
      if (state.queue.some((queued) => queued.slug === repo.slug)) return 'already';
      state.queue.push(repo);
      pump();
      return 'queued';
    },
    idle: () =>
      state.active.size === 0 && state.queue.length === 0
        ? Promise.resolve()
        : new Promise((resolve) => state.waiters.push(resolve)),
    clear: () => {
      state.queue.length = 0;
      state.again.clear();
    },
  };
}
