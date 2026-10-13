/** JavaScript-family regex symbols, run through the same symbol tree the indexer builds. */
import { describe, expect, test } from 'bun:test';
import { regexSymbols } from '../../../core/symbols/regex-symbols.ts';
import { jsSymbolPatterns } from '../symbols.ts';

const outline = (text: string): string[] =>
  regexSymbols(text, jsSymbolPatterns).map((symbol) => `${symbol.kind} ${symbol.name}`);

describe('jsSymbolPatterns', () => {
  test('finds classes, functions and arrow functions in an ES module', () => {
    const service = `import { db } from './db.js';

export default class OrderService {
  constructor(repo) {
    this.repo = repo;
  }
}

export async function cancelOrder(id, reason) {
  return db.orders.update(id, { status: 'cancelled', reason });
}

function* paginate(cursor) {
  yield cursor;
}

export const applyDiscount = async (order, code) => {
  return order;
};
const double = n => n * 2;
const handler: RequestHandler = async (req, res): Promise<void> => {};
export const createRouter = (
  deps,
) => {};
const legacy = function () {};
const total = (subtotal + tax) * 2;
`;
    expect(outline(service)).toEqual([
      'class OrderService',
      'function cancelOrder',
      'function paginate',
      'function applyDiscount',
      'function double',
      'function handler',
      'function createRouter',
      'function legacy',
    ]);
  });

  test('finds CommonJS exports and abstract or declared classes', () => {
    const commonjs = [
      'module.exports.findOrder = async function (id) {};',
      'exports.listOrders = (query) => db.find(query);',
      'exports.VERSION = "1.2.0";',
      'export declare abstract class Repository {}',
    ].join('\n');
    expect(outline(commonjs)).toEqual([
      'function findOrder',
      'function listOrders',
      'class Repository',
    ]);
  });
});
