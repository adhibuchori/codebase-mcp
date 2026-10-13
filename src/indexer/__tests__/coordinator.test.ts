import { expect, test } from 'bun:test';
import { createRegistry } from '../../config/repo-registry.ts';
import type { Repo } from '../../core/model/domain.types.ts';
import { createCoordinator } from '../coordinator.ts';
import { createJobQueue } from '../job-queue.ts';
import type { IndexJobRunner, IndexOutcome } from '../protocol.types.ts';

const repos: Repo[] = ['a', 'b', 'c'].map((slug) => ({ slug, root: `/r/${slug}`, group: '' }));
const OUTCOME: IndexOutcome = { files: 2, bytes: 20, changed: 1, removed: 0, ms: 5 };

function runner(behaviour: (repo: Repo) => Promise<IndexOutcome>, log: string[]): IndexJobRunner {
  return {
    run: async (repo, onProgress) => {
      log.push(`start ${repo.slug}`);
      onProgress(1, 2);
      const outcome = await behaviour(repo);
      log.push(`end ${repo.slug}`);
      return outcome;
    },
    close: async () => {},
  };
}

const quiet = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

test('the job queue runs a few at a time, never twice, and once more after a change', async () => {
  const log: string[] = [];
  const events: string[] = [];
  const queue = createJobQueue(
    runner(async () => {
      await Bun.sleep(20);
      return OUTCOME;
    }, log),
    2,
    {
      started: (repo) => events.push(`started ${repo.slug}`),
      progress: (repo, fraction) => events.push(`progress ${repo.slug} ${fraction}`),
      finished: (repo) => events.push(`finished ${repo.slug}`),
      failed: (repo) => events.push(`failed ${repo.slug}`),
    },
  );
  const [a, b, c] = repos;
  if (!a || !b || !c) throw new Error('repos');
  expect(queue.add(a)).toBe('queued');
  expect(queue.add(b)).toBe('queued');
  expect(queue.add(c)).toBe('queued');
  expect(queue.add(c)).toBe('already');
  expect(queue.add(a)).toBe('again');
  await queue.idle();
  expect(log.filter((line) => line === 'start a')).toHaveLength(2);
  expect(events).toContain('progress b 0.5');
  await queue.idle();
  queue.add(a);
  queue.clear();
  await queue.idle();
});

test('the coordinator tracks live state, failures and git changes', async () => {
  const log: string[] = [];
  const indexed: string[] = [];
  const fingerprints = new Map([
    ['a', 'x'],
    ['b', 'x'],
    ['c', 'x'],
  ]);
  const coordinator = createCoordinator({
    repos: createRegistry(repos),
    runner: runner(
      async (repo) => (repo.slug === 'c' ? Promise.reject(new Error('boom')) : OUTCOME),
      log,
    ),
    fingerprint: async (repo) => fingerprints.get(repo.slug) ?? '',
    onIndexed: (repo) => indexed.push(repo.slug),
    clock: { now: () => 42 },
    logger: quiet,
    concurrency: 1,
    refreshMs: 60_000,
    rescanMs: 60_000,
  });
  expect(coordinator.live('a')).toBeUndefined();
  coordinator.start();
  expect(coordinator.live('b')?.state).toBeOneOf(['queued', 'indexing']);
  await coordinator.idle();
  expect(coordinator.live('a')).toMatchObject({
    state: 'ready',
    files: 2,
    indexedAt: 42,
    progress: 1,
  });
  expect(coordinator.live('c')).toMatchObject({ state: 'failed', message: 'boom' });
  expect(indexed).toEqual(['a', 'b']);
  fingerprints.set('b', 'changed');
  await coordinator.refresh();
  await coordinator.idle();
  expect(log.filter((line) => line === 'start b')).toHaveLength(2);
  coordinator.stop();
});

test('quiet runs with nothing changed are not logged as indexed', async () => {
  const lines: string[] = [];
  const coordinator = createCoordinator({
    repos: createRegistry(repos.slice(0, 1)),
    runner: runner(async () => ({ ...OUTCOME, changed: 0 }), []),
    fingerprint: async () => '',
    onIndexed: () => {},
    clock: { now: () => 1 },
    logger: { ...quiet, info: (message) => lines.push(message) },
    concurrency: 2,
    refreshMs: 10,
    rescanMs: 15,
  });
  coordinator.start();
  await Bun.sleep(60);
  await coordinator.idle();
  coordinator.stop();
  expect(lines).toEqual([]);
});
