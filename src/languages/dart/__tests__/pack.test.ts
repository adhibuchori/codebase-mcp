/** The Dart pack: no grammar, so its regexes are the whole outline; calls are not definitions. */
import { describe, expect, test } from 'bun:test';
import { regexSymbols } from '../../../core/symbols/regex-symbols.ts';
import { dartPack } from '../pack.ts';

describe('dartPack', () => {
  test('is tier 3 without a grammar', () => {
    expect(dartPack).toMatchObject({ id: 'dart', name: 'Dart', tier: 3, extensions: ['.dart'] });
    expect(dartPack.grammar).toBeUndefined();
  });

  test('finds classes, mixins, extensions, enums and functions, not calls', () => {
    const source = `abstract interface class OrderRepository {
  Future<Order> find(String id);
}

class OrderService {
  Future<List<Order>> load(String customerId) async {
    if (customerId.isEmpty) {
      return [];
    }
    setState(() {
      loading = false;
    });
    print('loaded');
    return repository.all();
  }

  int count() => orders.length;
}

mixin Auditable on Entity {}

extension OrderTotals on Order {}

enum OrderStatus { open, shipped }

void main() {
  runApp(const ShopApp());
}
`;
    expect(
      regexSymbols(source, dartPack.symbolPatterns ?? []).map(
        (symbol) => `${symbol.kind} ${symbol.name}`,
      ),
    ).toEqual([
      'class OrderRepository',
      'class OrderService',
      'method load',
      'method count',
      'class Auditable',
      'impl OrderTotals',
      'enum OrderStatus',
      'function main',
    ]);
  });

  test('matches log and throw lines', () => {
    expect(dartPack.logCall?.test("    log.severe('refund failed', error, stackTrace);")).toBe(
      true,
    );
    expect(dartPack.logCall?.test("    throw StateError('order already shipped');")).toBe(true);
    expect(
      dartPack.logCall?.test('    final total = lines.fold(0, (sum, line) => sum + line.amount);'),
    ).toBe(false);
  });
});
