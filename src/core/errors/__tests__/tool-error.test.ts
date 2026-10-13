import { expect, test } from 'bun:test';
import { describeError, suggest, ToolError } from '../tool-error.ts';

test('a ToolError keeps its message and hint', () => {
  const error = new ToolError('Unknown repo "x".', 'Call list_repos.');
  expect(error.name).toBe('ToolError');
  expect(describeError(error)).toBe('Unknown repo "x".\nHint: Call list_repos.');
  expect(describeError(new ToolError('Plain.'))).toBe('Plain.');
});

test('any other error stays generic, so paths and stacks never leak', () => {
  expect(describeError(new Error('ENOENT: /Users/me/secret'))).toBe(
    'Internal error while running the tool. The server log has the details.',
  );
  expect(describeError('boom')).toContain('Internal error');
});

test('suggest ranks exact, contained and shared-prefix names', () => {
  const known = ['orders-java', 'orders-node', 'payments-go', 'billing'];
  expect(suggest('orders', known)).toEqual(['orders-java', 'orders-node']);
  expect(suggest('payments-go', known)[0]).toBe('payments-go');
  expect(suggest('bil', known)).toEqual(['billing']);
  expect(suggest('pa', known)).toEqual(['payments-go']);
  expect(suggest('zzz', known)).toEqual([]);
});
