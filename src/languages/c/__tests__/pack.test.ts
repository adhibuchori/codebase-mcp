/** The C pack: definitions at column 0 without a `;`, types, and error-reporting calls. */
import { describe, expect, test } from 'bun:test';
import { regexSymbols } from '../../../core/symbols/regex-symbols.ts';
import { cPack } from '../pack.ts';

describe('cPack', () => {
  test('is tier 2 with a grammar', () => {
    expect(cPack).toMatchObject({
      id: 'c',
      name: 'C',
      tier: 2,
      extensions: ['.c', '.h'],
      grammar: 'c',
    });
  });

  test('finds types and function definitions, not prototypes or calls', () => {
    const source = `#include "order.h"
#define MAX_ITEMS(n) ((n) * 2)

typedef unsigned long order_id_t;

struct order {
    order_id_t id;
};

typedef struct {
    int cents;
} money_t;

enum status { OPEN, SHIPPED };

int order_cancel(struct order *order);

static int
order_total(const struct order *order)
{
    return compute(order);
}

struct order *order_new(order_id_t id) {
    return NULL;
}
`;
    expect(
      regexSymbols(source, cPack.symbolPatterns ?? []).map(
        (symbol) => `${symbol.kind} ${symbol.name}`,
      ),
    ).toEqual([
      'type order_id_t',
      'struct order',
      'type money_t',
      'enum status',
      'function order_total',
      'function order_new',
    ]);
  });

  test('matches error reporting', () => {
    expect(cPack.logCall?.test('        fprintf(stderr, "cannot open %s\\n", path);')).toBe(true);
    expect(cPack.logCall?.test('        perror("connect");')).toBe(true);
    expect(cPack.logCall?.test('        printf("%d\\n", total);')).toBe(false);
  });
});
