/** The C++ pack: namespaces, types and out-of-class definitions, and error logging. */
import { describe, expect, test } from 'bun:test';
import { regexSymbols } from '../../../core/symbols/regex-symbols.ts';
import { cppPack } from '../pack.ts';

describe('cppPack', () => {
  test('is tier 2 with a grammar for every C++ extension', () => {
    expect(cppPack).toMatchObject({
      id: 'cpp',
      name: 'C++',
      tier: 2,
      extensions: ['.cc', '.cpp', '.cxx', '.hpp', '.hh', '.hxx'],
      grammar: 'cpp',
    });
  });

  test('finds namespaces, types and definitions, past qualified names', () => {
    const source = `namespace shop::orders {

class ORDERS_EXPORT OrderService : public Service {
};

template <typename T>
struct Page final {
};

class Forward;

enum class Status : int { Open, Shipped };

OrderService::OrderService(Repository& repo) : repo_(repo) {}

std::vector<Order> OrderService::list(const Filter& filter) const {
}

int main(int argc, char** argv) {
}

}
`;
    expect(
      regexSymbols(source, cppPack.symbolPatterns ?? []).map(
        (symbol) => `${symbol.kind} ${symbol.name}`,
      ),
    ).toEqual([
      'module shop::orders',
      'class OrderService',
      'struct Page',
      'enum Status',
      'function OrderService',
      'function list',
      'function main',
    ]);
  });

  test('matches error logging and throws', () => {
    expect(cppPack.logCall?.test('    spdlog::error("refund failed for {}", id);')).toBe(true);
    expect(cppPack.logCall?.test('    LOG(ERROR) << "connection lost";')).toBe(true);
    expect(cppPack.logCall?.test('    throw std::runtime_error("order not found");')).toBe(true);
    expect(cppPack.logCall?.test('    auto total = order.total();')).toBe(false);
  });
});
