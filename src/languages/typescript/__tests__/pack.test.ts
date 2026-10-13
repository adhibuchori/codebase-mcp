/** The TypeScript and TSX packs: identity, type-level fallback symbols, and the shared Node parts. */
import { describe, expect, test } from 'bun:test';
import { regexSymbols } from '../../../core/symbols/regex-symbols.ts';
import { tsxPack, typescriptPack } from '../pack.ts';

const outline = (text: string): string[] =>
  regexSymbols(text, typescriptPack.symbolPatterns ?? []).map(
    (symbol) => `${symbol.kind} ${symbol.name}`,
  );

describe('identity', () => {
  test('TypeScript and TSX are tier 1 with their own grammars', () => {
    expect(typescriptPack).toMatchObject({
      id: 'typescript',
      name: 'TypeScript',
      tier: 1,
      extensions: ['.ts', '.mts', '.cts'],
      grammar: 'typescript',
    });
    expect(tsxPack).toMatchObject({
      id: 'tsx',
      name: 'TypeScript (TSX)',
      tier: 1,
      extensions: ['.tsx'],
      grammar: 'tsx',
    });
    expect(tsxPack.symbolPatterns).toBe(typescriptPack.symbolPatterns);
  });
});

describe('symbols', () => {
  test('finds type-level declarations next to classes and functions', () => {
    const module = `export interface Order {
  id: string;
}
export type OrderStatus = 'open' | 'shipped';
type Handler<T> = (input: T) => Promise<void>;
export const enum Currency {
  EUR = 'EUR',
}
declare namespace Express.Orders {}
export abstract class Repository<T> {}
export function toDto(order: Order): OrderDto {}
export const isOpen = (order: Order): boolean => order.status === 'open';
`;
    expect(outline(module)).toEqual([
      'interface Order',
      'type OrderStatus',
      'type Handler',
      'enum Currency',
      'module Express.Orders',
      'class Repository',
      'function toDto',
      'function isOpen',
    ]);
  });

  test('finds React components in TSX', () => {
    const component =
      'export default function OrderList({ orders }: Props) {}\nconst Row = ({ order }: RowProps) => <tr />;';
    expect(
      regexSymbols(component, tsxPack.symbolPatterns ?? []).map((symbol) => symbol.name),
    ).toEqual(['OrderList', 'Row']);
  });
});

describe('shared Node parts', () => {
  test('routes, frameworks and log calls come from the Node runtime', () => {
    const [extract] = typescriptPack.routeExtractors ?? [];
    expect(extract?.("router.get('/orders', list);").map((route) => route.pattern)).toEqual([
      '/orders',
    ]);
    const framework = typescriptPack.frameworks?.find((rule) =>
      rule.contains.test('"@nestjs/core": "^10.0.0"'),
    );
    expect(framework?.name).toBe('nestjs');
    expect(typescriptPack.logCall?.test("this.logger.warn('Order cancelled twice');")).toBe(true);
  });
});
