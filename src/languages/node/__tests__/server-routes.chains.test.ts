/** Chained registrations (koa-router, Hono) keep their router's prefix; test-client chains are calls. */
import { describe, expect, test } from 'bun:test';
import type { RouteDef } from '../../../core/model/domain.types.ts';
import { serverRoutes } from '../server-routes.ts';

const brief = (routes: readonly RouteDef[]): string[] =>
  routes
    .toSorted((a, b) => a.line - b.line)
    .map((route) => `${route.line} ${route.method} ${route.pattern} [${route.framework}]`);

describe('koa-router', () => {
  test('applies the router prefix to named and chained routes', () => {
    const routes = `const Koa = require('koa');
const Router = require('@koa/router');

const app = new Koa();
const router = new Router({ prefix: '/orders' });

router.get('order', '/:id', getOrder);
router
  .post('/', createOrder)
  .put('/:id', updateOrder)
  .del('/:id', removeOrder);
router.get('list-by-name', listByName);

app.use(router.routes()).use(router.allowedMethods());
`;
    expect(brief(serverRoutes(routes))).toEqual([
      '7 GET /orders/:id [koa]',
      '9 POST /orders [koa]',
      '10 PUT /orders/:id [koa]',
      '11 DELETE /orders/:id [koa]',
    ]);
  });
});

describe('Hono', () => {
  test('follows chains on new Hono(), basePath and mounted sub-apps', () => {
    const app = `import { Hono } from 'hono';
import { orders as legacyOrders } from './legacy';

const api = new Hono().basePath('/api');
const orders = new Hono()
  .get('/', (c) => c.json(listOrders()))
  .post('/', async (c) => {
    const body = await c.req.json();
    return c.json(createOrder(body), 201);
  })
  .get('/:id', (c) => c.json(getOrder(c.req.param('id'))));

api.route('/orders', orders);
api.route('/legacy', legacyOrders);
api.get('/health', (c) => c.text('ok'));

export default api;
`;
    expect(brief(serverRoutes(app))).toEqual([
      '6 GET /api/orders [hono]',
      '7 POST /api/orders [hono]',
      '11 GET /api/orders/:id [hono]',
      '14 ANY /api/legacy [hono]',
      '15 GET /api/health [hono]',
    ]);
  });
});

describe('test clients', () => {
  test('a supertest chain declares nothing', () => {
    const spec = `import request from 'supertest';
import app from '../src/app.js';

test('lists orders', async () => {
  await request(app)
    .get('/orders')
    .expect(200);
});
`;
    expect(serverRoutes(spec)).toEqual([]);
  });
});
