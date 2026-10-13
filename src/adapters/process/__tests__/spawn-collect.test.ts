import { expect, test } from 'bun:test';
import { spawnCollect } from '../spawn-collect.ts';

const bun = process.execPath;

test('collects stdout, stderr and the exit code', async () => {
  const result = await spawnCollect(
    bun,
    ['-e', 'console.log("out"); console.error("err"); process.exit(3)'],
    { cwd: '.', maxBytes: 1000, timeoutMs: 10_000 },
  );
  expect(result).toMatchObject({
    code: 3,
    stdout: 'out\n',
    stderr: 'err\n',
    truncated: false,
    timedOut: false,
    stopped: false,
  });
});

test('stops at the byte limit', async () => {
  const result = await spawnCollect(bun, ['-e', 'process.stdout.write("x".repeat(100000))'], {
    cwd: '.',
    maxBytes: 100,
    timeoutMs: 10_000,
  });
  expect(result.truncated).toBe(true);
  expect(result.stdout.length).toBe(100);
});

test('stops at the deadline', async () => {
  const result = await spawnCollect(bun, ['-e', 'setTimeout(() => {}, 10000)'], {
    cwd: '.',
    maxBytes: 100,
    timeoutMs: 200,
  });
  expect(result.timedOut).toBe(true);
});

test('feeds lines and stops when the callback says so', async () => {
  const seen: string[] = [];
  const result = await spawnCollect(
    bun,
    [
      '-e',
      'for (let i = 0; i < 5; i++) console.log("line " + i); setTimeout(() => console.log("late"), 2000)',
    ],
    {
      cwd: '.',
      maxBytes: 10_000,
      timeoutMs: 10_000,
      onLine: (line) => {
        seen.push(line);
        return seen.length < 3;
      },
    },
  );
  expect(result.stopped).toBe(true);
  expect(seen.slice(0, 3)).toEqual(['line 0', 'line 1', 'line 2']);
});

test('delivers a last line without a newline', async () => {
  const seen: string[] = [];
  await spawnCollect(bun, ['-e', 'process.stdout.write("a\\nb")'], {
    cwd: '.',
    maxBytes: 1000,
    timeoutMs: 10_000,
    env: { PATH: '' },
    onLine: (line) => seen.push(line) > 0,
  });
  expect(seen).toEqual(['a', 'b']);
});

test('reports a program that cannot start', async () => {
  const result = await spawnCollect('/definitely/not/a/program', [], {
    cwd: '.',
    maxBytes: 100,
    timeoutMs: 1000,
  });
  expect(result.code).toBeNull();
  expect(result.stderr).not.toBe('');
});
