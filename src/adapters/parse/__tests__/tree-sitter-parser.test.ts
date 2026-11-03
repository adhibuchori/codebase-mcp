import { expect, test } from 'bun:test';
import { join } from 'node:path';
import type { LanguagePack } from '../../../core/model/language-pack.types.ts';
import { createConsoleLogger } from '../../logger/console-logger.ts';
import { createTreeSitterParser } from '../tree-sitter-parser.ts';

const ASSETS = join(import.meta.dirname, '..', '..', '..', '..', 'assets');
const warnings: string[] = [];
const parser = createTreeSitterParser({
  grammarsDir: join(ASSETS, 'grammars'),
  queriesDir: join(ASSETS, 'queries'),
  logger: createConsoleLogger('warn', (line) => warnings.push(line)),
});

const pack = (fields: Partial<LanguagePack>): LanguagePack => ({
  id: 'x',
  name: 'X',
  tier: 1,
  extensions: [],
  ...fields,
});
const fallback = [{ kind: 'class', regex: /^\s*class\s+(\w+)/ }];

const SAMPLES: readonly [string, string, readonly string[]][] = [
  [
    'java',
    'class OrderService {\n  void cancel(String id) {\n  }\n}\n',
    ['OrderService', 'OrderService.cancel'],
  ],
  [
    'kotlin',
    'class Order(val id: Int) {\n  fun cancel() {}\n}\nfun top() {}\n',
    ['Order', 'Order.cancel', 'top'],
  ],
  [
    'go',
    'package main\ntype Service struct{}\nfunc (s *Service) Refund() error { return nil }\n',
    ['Service', 'Refund'],
  ],
  [
    'typescript',
    'export class Svc {\n  run(): void {}\n}\ninterface Shape { x: number }\n',
    ['Svc', 'Svc.run', 'Shape'],
  ],
  ['tsx', 'export function App() {\n  return <div />;\n}\n', ['App']],
  ['javascript', 'class C {\n  m() {}\n}\nfunction f() {}\n', ['C', 'C.m', 'f']],
  [
    'python',
    'class A:\n    def run(self):\n        pass\n\ndef top():\n    pass\n',
    ['A', 'A.run', 'top'],
  ],
  [
    'csharp',
    'namespace N {\n  class Invoice {\n    public void Pay() {}\n  }\n}\n',
    ['N', 'N.Invoice', 'N.Invoice.Pay'],
  ],
  ['php', '<?php\nclass A {\n  function run() {}\n}\n', ['A', 'A.run']],
  ['ruby', 'class A\n  def run\n  end\nend\n', ['A', 'A.run']],
  ['rust', 'struct S;\nimpl S {\n  fn run(&self) {}\n}\n', ['S', 'run']],
  ['scala', 'object Main {\n  def run(): Unit = {}\n}\n', ['Main', 'Main.run']],
  ['c', 'int run(void) {\n  return 0;\n}\n', ['run']],
  ['cpp', 'class A {\n  void run();\n};\n', ['A', 'A.run']],
  ['elixir', 'defmodule A do\n  def run, do: :ok\nend\n', ['A', 'A.run']],
  ['swift', 'final class A {\n  func run() {}\n}\n', ['A', 'A.run']],
];

test.each(SAMPLES)(
  'every vendored grammar loads and finds definitions: %s',
  async (grammar, source, expected) => {
    const symbols = await parser.parse(pack({ grammar }), source);
    const names = symbols.map((symbol) =>
      symbol.container ? `${symbol.container}.${symbol.name}` : symbol.name,
    );
    for (const name of expected) expect(names).toContain(name);
  },
);

test('a missing grammar falls back to the regex patterns, once logged', async () => {
  const missing = pack({ grammar: 'no-such-grammar', symbolPatterns: fallback });
  expect((await parser.parse(missing, 'class Kept {}')).map((s) => s.name)).toEqual(['Kept']);
  expect((await parser.parse(missing, 'class Again {}')).map((s) => s.name)).toEqual(['Again']);
  expect(warnings.filter((line) => line.includes('no-such-grammar'))).toHaveLength(1);
});

test('no grammar, huge files and minified files use the regex patterns', async () => {
  expect(await parser.parse(pack({}), 'class X {}')).toEqual([]);
  expect(
    (await parser.parse(pack({ symbolPatterns: fallback }), 'class Plain {}')).map((s) => s.name),
  ).toEqual(['Plain']);
  const minified = `class Min {}${';'.repeat(5000)}`;
  expect(
    (await parser.parse(pack({ grammar: 'java', symbolPatterns: fallback }), minified)).map(
      (s) => s.name,
    ),
  ).toEqual(['Min']);
  const huge = `class Big {}\n${'// x\n'.repeat(120_000)}`;
  expect(
    (await parser.parse(pack({ grammar: 'java', symbolPatterns: fallback }), huge)).map(
      (s) => s.name,
    ),
  ).toEqual(['Big']);
});

const javaGraph = pack({ grammar: 'java', graph: { queries: ['java'], imports: 'packages' } });

test('analyze returns symbols and the call graph from one parse', async () => {
  const source =
    'package com.acme;\nimport com.acme.pay.Client;\nclass Svc {\n  private Client client;\n  void run() {\n    client.pay();\n  }\n}\n';
  const { symbols, graph } = await parser.analyze(javaGraph, source);
  expect(symbols.map((s) => s.name)).toEqual(['Svc', 'run']);
  expect(graph.pkg).toBe('com.acme');
  expect(graph.imports).toEqual([{ local: 'Client', imported: 'Client', source: 'com.acme.pay' }]);
  expect(graph.refs).toEqual([
    {
      kind: 'call',
      name: 'pay',
      receiver: 'client',
      scope: 'com.acme.pay.Client',
      line: 6,
      origin: 'Svc.run',
    },
  ]);
});

test('without a graph query, calls come from the tags query by name; without a grammar, none', async () => {
  const go = await parser.analyze(
    pack({ grammar: 'go' }),
    'package main\nfunc run() {\n  stop()\n}\n',
  );
  expect(go.graph.refs.map((r) => [r.name, r.scope, r.origin])).toEqual([['stop', '', 'run']]);
  expect(
    (await parser.analyze(pack({ symbolPatterns: fallback }), 'class P {}')).graph.refs,
  ).toEqual([]);
});

test('a graph query that fails to load is logged once and calls fall back to names', async () => {
  const broken = pack({
    id: 'broken',
    grammar: 'java',
    graph: { queries: ['no-such-part'], imports: 'packages' },
  });
  const source = 'class A {\n  void run() {\n    go();\n  }\n}\n';
  expect((await parser.analyze(broken, source)).graph.refs.map((r) => r.name)).toEqual(['go']);
  await parser.analyze(broken, source);
  expect(warnings.filter((line) => line.includes('graph query unavailable'))).toHaveLength(1);
});
