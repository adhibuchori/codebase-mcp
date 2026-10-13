import { expect, test } from 'bun:test';
import {
  buildSymbols,
  enclosingSymbol,
  qualifiedName,
  signatureOf,
  type RawDefinition,
} from '../symbol-tree.ts';

const def = (name: string, kind: string, line: number, endLine: number): RawDefinition => ({
  name,
  kind,
  line,
  endLine,
  signature: `${kind} ${name}`,
});

test('nests definitions, names containers and turns functions in a class into methods', () => {
  const symbols = buildSymbols([
    def('cancel', 'function', 5, 9),
    def('OrderService', 'class', 1, 20),
    def('find', 'function', 11, 14),
    def('helper', 'function', 22, 25),
  ]);
  expect(symbols.map((s) => [s.name, s.kind, s.container])).toEqual([
    ['OrderService', 'class', ''],
    ['cancel', 'method', 'OrderService'],
    ['find', 'method', 'OrderService'],
    ['helper', 'function', ''],
  ]);
});

test('folds a definition reported twice, keeping the more specific kind', () => {
  const symbols = buildSymbols([
    def('run', 'function', 3, 3),
    def('run', 'method', 3, 3),
    def('Other', 'type', 3, 3),
    def('Other', 'function', 3, 3),
  ]);
  expect(symbols.map((s) => `${s.name}:${s.kind}`)).toEqual(['run:method', 'Other:type']);
});

test('nested containers produce dotted names', () => {
  const symbols = buildSymbols([
    def('Outer', 'class', 1, 30),
    def('Inner', 'class', 2, 20),
    def('go', 'function', 3, 5),
  ]);
  expect(qualifiedName(symbols[2] ?? { container: '', name: '' })).toBe('Outer.Inner.go');
});

test('enclosingSymbol finds the innermost range', () => {
  const symbols = buildSymbols([
    def('OrderService', 'class', 1, 20),
    def('cancel', 'function', 5, 9),
  ]);
  expect(enclosingSymbol(symbols, 6)?.name).toBe('cancel');
  expect(enclosingSymbol(symbols, 15)?.name).toBe('OrderService');
  expect(enclosingSymbol(symbols, 40)).toBeUndefined();
});

test('signatureOf trims braces and caps length', () => {
  expect(signatureOf('  public Order cancel(String id) {  ')).toBe(
    'public Order cancel(String id)',
  );
  expect(signatureOf('x'.repeat(200), 20)).toHaveLength(20);
});
