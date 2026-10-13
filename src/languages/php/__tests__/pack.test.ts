/** The PHP pack: identity, fallback symbols, composer frameworks, log and throw lines. */
import { describe, expect, test } from 'bun:test';
import { regexSymbols } from '../../../core/symbols/regex-symbols.ts';
import { phpPack } from '../pack.ts';

describe('phpPack', () => {
  test('is tier 2 with a grammar and the PHP routes', () => {
    expect(phpPack).toMatchObject({
      id: 'php',
      name: 'PHP',
      tier: 2,
      extensions: ['.php'],
      grammar: 'php',
    });
    expect(phpPack.routeExtractors).toHaveLength(1);
  });

  test('finds classes, interfaces, traits, enums, functions and methods', () => {
    const source = `<?php
final class OrderService
{
    public function __construct(private OrderRepository $orders) {}

    public static function &instance(): self {}
}
interface OrderRepository {}
trait LogsEvents {}
enum OrderStatus: string {}
abstract readonly class Money {}
function format_money(int $cents): string {}
$closure = function () {};
`;
    expect(
      regexSymbols(source, phpPack.symbolPatterns ?? []).map(
        (symbol) => `${symbol.kind} ${symbol.name}`,
      ),
    ).toEqual([
      'class OrderService',
      'method __construct',
      'method instance',
      'interface OrderRepository',
      'trait LogsEvents',
      'enum OrderStatus',
      'class Money',
      'function format_money',
    ]);
  });

  test('detects frameworks from composer.json', () => {
    const composer =
      '{\n  "require": {\n    "php": "^8.2",\n    "laravel/framework": "^11.0",\n    "symfony/framework-bundle": "^7.0"\n  }\n}';
    const detected = (phpPack.frameworks ?? [])
      .filter((rule) => rule.file.test('composer.json') && rule.contains.test(composer))
      .map((rule) => rule.name);
    expect(detected).toEqual(['laravel', 'symfony']);
  });

  test('matches log and throw lines', () => {
    expect(phpPack.logCall?.test("        Log::error('Refund failed', ['order' => $id]);")).toBe(
      true,
    );
    expect(phpPack.logCall?.test("        $this->logger->warning('Retrying payment');")).toBe(true);
    expect(
      phpPack.logCall?.test('        throw new \\RuntimeException("Order $id not found");'),
    ).toBe(true);
    expect(phpPack.logCall?.test('        $total = $order->total();')).toBe(false);
  });
});
