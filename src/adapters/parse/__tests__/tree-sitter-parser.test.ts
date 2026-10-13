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
