/** The JavaScript pack: identity, CommonJS-aware symbols, routes, frameworks and log calls. */
import { describe, expect, test } from 'bun:test';
import { regexSymbols } from '../../../core/symbols/regex-symbols.ts';
import { javascriptPack } from '../pack.ts';

describe('javascriptPack', () => {
  test('is tier 1 for every JavaScript module flavour', () => {
    expect(javascriptPack).toMatchObject({
      id: 'javascript',
      name: 'JavaScript',
      tier: 1,
      extensions: ['.js', '.mjs', '.cjs', '.jsx'],
      grammar: 'javascript',
    });
  });

  test('finds symbols in a CommonJS module', () => {
    const module = `const express = require('express');

class OrderRepository {
  constructor(db) {
    this.db = db;
  }
}

async function findOrder(id) {
  return db.orders.findById(id);
}

module.exports.cancelOrder = async (id) => {};
exports.listOrders = function (query) {};
`;
    const symbols = regexSymbols(module, javascriptPack.symbolPatterns ?? []);
    expect(symbols.map((symbol) => `${symbol.kind} ${symbol.name}`)).toEqual([
      'class OrderRepository',
      'function findOrder',
      'function cancelOrder',
      'function listOrders',
    ]);
  });

  test('extracts routes and detects frameworks the way the TypeScript pack does', () => {
    const [extract] = javascriptPack.routeExtractors ?? [];
    expect(
      extract?.("app.post('/orders', create);").map((route) => `${route.method} ${route.pattern}`),
    ).toEqual(['POST /orders']);
    const detected = (javascriptPack.frameworks ?? [])
      .filter(
        (rule) =>
          rule.file.test('package.json') &&
          rule.contains.test('{ "dependencies": { "koa": "^2.15.0" } }'),
      )
      .map((rule) => rule.name);
    expect(detected).toEqual(['koa']);
    expect(javascriptPack.logCall?.test("logger.error({ err }, 'payment failed');")).toBe(true);
    expect(javascriptPack.logCall?.test('const total = sum(items);')).toBe(false);
  });
});
