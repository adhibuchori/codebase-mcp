import { expect, test } from 'bun:test';
import { regexSymbols } from '../regex-symbols.ts';

const patterns = [
  { kind: 'class', regex: /^\s*class\s+(\w+)/ },
  { kind: 'function', regex: /^\s*func\s+(\w+)/ },
];

test('finds definitions line by line and ends each at the next sibling', () => {
  const text = [
    'class Order',
    '  func cancel',
    '  func find',
    'class Payment',
    '  func refund',
  ].join('\n');
  const symbols = regexSymbols(text, patterns);
  expect(symbols.map((s) => [s.name, s.kind, s.line, s.endLine, s.container])).toEqual([
    ['Order', 'class', 1, 3, ''],
    ['cancel', 'method', 2, 2, 'Order'],
    ['find', 'method', 3, 3, 'Order'],
    ['Payment', 'class', 4, 5, ''],
    ['refund', 'method', 5, 5, 'Payment'],
  ]);
});

test('no patterns, no symbols', () => {
  expect(regexSymbols('class X', [])).toEqual([]);
});
