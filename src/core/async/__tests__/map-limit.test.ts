import { expect, test } from 'bun:test';
import { chunk, mapLimit } from '../map-limit.ts';

test('keeps input order and never runs more than the limit at once', async () => {
  let running = 0;
  let peak = 0;
  const result = await mapLimit([30, 10, 20, 5, 15], 2, async (delay, index) => {
    running++;
    peak = Math.max(peak, running);
    await Bun.sleep(delay);
    running--;
    return index * 10;
  });
  expect(result).toEqual([0, 10, 20, 30, 40]);
  expect(peak).toBe(2);
});

test('an empty list and a limit above the count', async () => {
  expect(await mapLimit([], 4, async (x: number) => x)).toEqual([]);
  expect(await mapLimit([1, 2], 10, async (x) => x * 2)).toEqual([2, 4]);
});

test('chunk splits into fixed-size parts', () => {
  expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  expect(chunk([], 3)).toEqual([]);
});
