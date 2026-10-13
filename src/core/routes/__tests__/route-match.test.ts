import { describe, expect, test } from 'bun:test';
import { joinRoute, matchRoute, pathOf, routeSegments } from '../route-match.ts';

test('pathOf strips method, scheme, host, query and template base', () => {
  expect(pathOf('POST https://shop.example.com/api/orders/1?x=1#y')).toBe('/api/orders/1');
  expect(pathOf('${ORDERS_URL}/api/orders/${id}/cancel')).toBe('/api/orders/${id}/cancel');
});

test('routeSegments recognises every parameter style and concrete ids', () => {
  expect(
    routeSegments('/orders/{id}/:item/<int:n>/[slug]/123/9f8e7d6c-1234-4abc-9def-0123456789ab/*'),
  ).toEqual([
    { kind: 'static', value: 'orders' },
    { kind: 'param' },
    { kind: 'param' },
    { kind: 'param' },
    { kind: 'param' },
    { kind: 'param' },
    { kind: 'param' },
    { kind: 'rest' },
  ]);
});

describe('matchRoute', () => {
  test('exact template and concrete URL match best', () => {
    expect(matchRoute('/api/orders/123/cancel', '/api/orders/{id}/cancel')).toBe(103);
    expect(matchRoute('POST /api/orders/{id}/cancel', '/api/orders/:id/cancel')).toBe(103);
  });

  test('a gateway prefix or a context path still matches, lower', () => {
    expect(matchRoute('/api/payments/7/refund', '/payments/:id/refund')).toBe(61);
    expect(matchRoute('/payments/7/refund', '/api/payments/:id/refund')).toBe(52);
  });

  test('different static segments or lengths do not match', () => {
    expect(matchRoute('/api/orders/1/cancel', '/api/orders/{id}/refund')).toBe(0);
    expect(matchRoute('/api/orders', '/api/orders/{id}')).toBe(0);
    expect(matchRoute('/', '/api')).toBe(0);
    expect(matchRoute('/api', '')).toBe(0);
  });

  test('a trailing wildcard takes the rest', () => {
    expect(matchRoute('/static/js/app.js', '/static/*')).toBeGreaterThan(0);
    expect(matchRoute('/other', '/static/*')).toBe(0);
  });
});

test('joinRoute joins prefixes and paths without doubled or trailing slashes', () => {
  expect(joinRoute('/api/orders', '{id}')).toBe('/api/orders/{id}');
  expect(joinRoute('/api/orders/', '/{id}/')).toBe('/api/orders/{id}');
  expect(joinRoute('', '')).toBe('/');
  expect(joinRoute('api', 'x')).toBe('/api/x');
});
