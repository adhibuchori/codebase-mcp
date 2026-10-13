/**
 * IndexJobRunner on worker_threads (Bun and Node both run a TypeScript worker entry directly).
 * One job per worker at a time; a worker that crashes fails its job and is replaced.
 */
import { Worker } from 'node:worker_threads';
import type { Repo } from '../../core/model/domain.types.ts';
import type {
  IndexJobRunner,
  IndexOutcome,
  IndexSettings,
  WorkerReply,
} from '../../indexer/protocol.types.ts';

interface Pending {
  readonly resolve: (outcome: IndexOutcome) => void;
  readonly reject: (error: Error) => void;
  readonly onProgress: (done: number, total: number) => void;
}

interface Slot {
  worker: Worker;
  job: number | null;
}

interface PoolState {
  readonly pending: Map<number, Pending>;
  readonly waiting: { id: number; repo: Repo }[];
  readonly slots: Slot[];
  readonly entry: URL;
  readonly settings: IndexSettings;
}

function isReply(value: unknown): value is WorkerReply {
  return typeof value === 'object' && value !== null && 'type' in value && 'id' in value;
}

function dispatch(state: PoolState): void {
  for (const slot of state.slots) {
    const job = slot.job === null ? state.waiting.shift() : undefined;
    if (!job) continue;
    slot.job = job.id;
    slot.worker.postMessage(
      { type: 'index', id: job.id, repo: job.repo, settings: state.settings },
      [],
    );
  }
}

function onReply(state: PoolState, slot: Slot, message: WorkerReply): void {
  const job = state.pending.get(message.id);
  if (!job) return;
  if (message.type === 'progress') {
    job.onProgress(message.done, message.total);
    return;
  }
  state.pending.delete(message.id);
  slot.job = null;
  if (message.type === 'done') job.resolve(message.outcome);
  else job.reject(new Error(message.message));
  dispatch(state);
}

function spawnSlot(state: PoolState): Slot {
  const slot: Slot = { worker: new Worker(state.entry), job: null };
  slot.worker.on('message', (message: unknown) => {
    if (isReply(message)) onReply(state, slot, message);
  });
  slot.worker.on('error', (error) => {
    if (slot.job !== null) {
      state.pending
        .get(slot.job)
        ?.reject(error instanceof Error ? error : new Error(String(error)));
      state.pending.delete(slot.job);
    }
    state.slots[state.slots.indexOf(slot)] = spawnSlot(state);
    dispatch(state);
  });
  slot.worker.unref();
  return slot;
}

export function createWorkerRunner(options: {
  size: number;
  entry: URL;
  settings: IndexSettings;
}): IndexJobRunner {
  const state: PoolState = {
    pending: new Map(),
    waiting: [],
    slots: [],
    entry: options.entry,
    settings: options.settings,
  };
  for (let i = 0; i < Math.max(1, options.size); i++) state.slots.push(spawnSlot(state));
  let nextId = 1;
  return {
    run: (repo, onProgress) =>
      new Promise<IndexOutcome>((resolve, reject) => {
        const id = nextId++;
        state.pending.set(id, { resolve, reject, onProgress });
        state.waiting.push({ id, repo });
        dispatch(state);
      }),
    close: async () => {
      await Promise.all(state.slots.map((slot) => slot.worker.terminate()));
    },
  };
}
