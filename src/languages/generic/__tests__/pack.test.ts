/** The fallback packs: common definition shapes for unknown languages, SQL tables for config files. */
import { describe, expect, test } from 'bun:test';
import { regexSymbols } from '../../../core/symbols/regex-symbols.ts';
import { configPack, genericPack } from '../pack.ts';

const outline = (text: string, patterns = genericPack.symbolPatterns ?? []): string[] =>
  regexSymbols(text, patterns).map((symbol) => `${symbol.kind} ${symbol.name}`);

describe('genericPack', () => {
  test('is the tier 3 fallback for any extension', () => {
    expect(genericPack).toMatchObject({ id: 'generic', name: 'Other', tier: 3, extensions: [] });
    expect(genericPack.grammar).toBeUndefined();
  });

  test('finds the definition shapes most languages share', () => {
    const lua = 'local function connect(opts)\n  return nil\nend';
    const perl = 'sub process_order {\n  my ($order) = @_;\n}';
    const zig = 'pub fn main() !void {\n}';
    const nim = 'proc handle(event: Event) =\n  discard';
    expect(outline(lua)).toEqual(['function connect']);
    expect(outline(perl)).toEqual(['function process_order']);
    expect(outline(zig)).toEqual(['function main']);
    expect(outline(nim)).toEqual(['function handle']);
  });

  test('finds types behind up to two modifiers', () => {
    const groovy = [
      'public abstract class BillingJob {',
      '  def run() {',
      '  }',
      '}',
      'interface Repository {}',
      'struct Point {}',
      'module Orders',
    ].join('\n');
    expect(outline(groovy)).toEqual([
      'class BillingJob',
      'method run',
      'interface Repository',
      'struct Point',
      'module Orders',
    ]);
  });

  test('ignores prose that merely mentions a keyword', () => {
    expect(outline('The class Foo is created per request.\nEach function call is logged.')).toEqual(
      [],
    );
  });
});

describe('configPack', () => {
  test('claims build, deploy and data files', () => {
    expect(configPack).toMatchObject({ id: 'config', name: 'Config', tier: 3 });
    expect(configPack.extensions).toContain('.yaml');
    expect(configPack.extensions).toContain('.sql');
    expect(configPack.fileNames).toEqual([
      'Dockerfile',
      'Makefile',
      'Jenkinsfile',
      'docker-compose.yml',
    ]);
  });

  test('reports SQL tables as its only symbols', () => {
    const migration = [
      'CREATE TABLE IF NOT EXISTS public.orders (',
      '  id BIGSERIAL PRIMARY KEY',
      ');',
      'create temporary table "order_items" (id int);',
      'CREATE INDEX orders_status ON orders (status);',
    ].join('\n');
    expect(outline(migration, configPack.symbolPatterns)).toEqual([
      'table orders',
      'table order_items',
    ]);
  });

  test('finds no symbol in YAML keys', () => {
    expect(outline('orders:\n  image: orders-api:1.4.2\n', configPack.symbolPatterns)).toEqual([]);
  });
});
