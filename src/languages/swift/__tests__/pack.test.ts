/** The Swift pack: no grammar, so its regexes are the whole outline; Vapor and log lines too. */
import { describe, expect, test } from 'bun:test';
import { regexSymbols } from '../../../core/symbols/regex-symbols.ts';
import { swiftPack } from '../pack.ts';

describe('swiftPack', () => {
  test('is tier 3 without a grammar', () => {
    expect(swiftPack).toMatchObject({
      id: 'swift',
      name: 'Swift',
      tier: 3,
      extensions: ['.swift'],
    });
    expect(swiftPack.grammar).toBeUndefined();
  });

  test('finds declarations behind attributes and modifiers', () => {
    const source = `import Vapor

@MainActor public final class OrderStore: ObservableObject {
    @Published private(set) var orders: [Order] = []

    public func load() async throws {
    }

    class func shared() -> OrderStore { OrderStore() }
}

struct Order: Codable, Identifiable {
    let id: UUID
}

enum OrderError: Error {
    case notFound
}

protocol OrderRepository {
    func find(id: UUID) async throws -> Order
}

extension Order.Status {
}

let note = "class Fake {}"
// struct Commented {}
`;
    expect(
      regexSymbols(source, swiftPack.symbolPatterns ?? []).map(
        (symbol) => `${symbol.kind} ${symbol.name}`,
      ),
    ).toEqual([
      'class OrderStore',
      'method load',
      'method shared',
      'struct Order',
      'enum OrderError',
      'interface OrderRepository',
      'method find',
      'impl Order.Status',
    ]);
  });

  test('detects Vapor in Package.swift and matches log and throw lines', () => {
    const manifest = '.package(url: "https://github.com/vapor/vapor.git", from: "4.92.0"),';
    const rule = swiftPack.frameworks?.find(
      (candidate) => candidate.file.test('Package.swift') && candidate.contains.test(manifest),
    );
    expect(rule?.name).toBe('vapor');
    expect(swiftPack.logCall?.test('        logger.error("Order \\(id) not found")')).toBe(true);
    expect(swiftPack.logCall?.test('        throw Abort(.notFound)')).toBe(true);
    expect(swiftPack.logCall?.test('        let total = items.reduce(0, +)')).toBe(false);
  });
});
