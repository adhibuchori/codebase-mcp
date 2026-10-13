import { expect, test } from 'bun:test';
import { ToolError } from '../../errors/tool-error.ts';
import { formatRef, parseRef } from '../ref.ts';

test('parses every reference form', () => {
  expect(parseRef('orders/src/App.java')).toEqual({ repo: 'orders', path: 'src/App.java' });
  expect(parseRef('orders/src/App.java:42')).toEqual({
    repo: 'orders',
    path: 'src/App.java',
    line: 42,
  });
  expect(parseRef('orders/src/App.java:42-80')).toEqual({
    repo: 'orders',
    path: 'src/App.java',
    line: 42,
    endLine: 80,
  });
  expect(parseRef('orders/src/App.java#OrderService.cancel')).toEqual({
    repo: 'orders',
    path: 'src/App.java',
    symbol: 'OrderService.cancel',
  });
  expect(parseRef(' orders\\src\\App.java ')).toEqual({ repo: 'orders', path: 'src/App.java' });
});

test('refuses text that is not a reference', () => {
  expect(() => parseRef('orders')).toThrow(ToolError);
  expect(() => parseRef('/abs/path')).toThrow('not a code reference');
  expect(() => parseRef('orders/')).toThrow(ToolError);
});

test('formats references', () => {
  expect(formatRef('orders', 'a.ts')).toBe('orders/a.ts');
  expect(formatRef('orders', 'a.ts', 3)).toBe('orders/a.ts:3');
});
