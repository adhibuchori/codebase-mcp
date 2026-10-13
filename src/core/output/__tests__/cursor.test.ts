import { expect, test } from 'bun:test';
import { ToolError } from '../../errors/tool-error.ts';
import { decodeCursor, encodeCursor, requestKey } from '../cursor.ts';

test('a cursor round-trips for the same request', () => {
  const key = requestKey(['search_code', 'cancel', ['orders']]);
  expect(decodeCursor(encodeCursor(40, key), key)).toBe(40);
});

test('no cursor means the first page', () => {
  expect(decodeCursor(undefined, 'k')).toBe(0);
  expect(decodeCursor('', 'k')).toBe(0);
});

test('a cursor from another request or a garbled one is refused', () => {
  const key = requestKey(['a']);
  const other = requestKey(['b']);
  expect(key).not.toBe(other);
  expect(() => decodeCursor(encodeCursor(10, other), key)).toThrow(ToolError);
  expect(() => decodeCursor('not-a-cursor', key)).toThrow('different request');
});

test('request keys are stable', () => {
  expect(requestKey([1, 'x', undefined])).toBe(requestKey([1, 'x', undefined]));
});
