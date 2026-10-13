/** Express and Fastify registrations, mounts and their prefixes, and calls that are not registrations. */
import { describe, expect, test } from 'bun:test';
import type { RouteDef } from '../../../core/model/domain.types.ts';
import { serverRoutes } from '../server-routes.ts';

const brief = (routes: readonly RouteDef[]): string[] =>
  routes
    .toSorted((a, b) => a.line - b.line)
    .map((route) => `${route.line} ${route.method} ${route.pattern} [${route.framework}]`);

const expressApp = `import express from 'express';
import { authenticate } from './auth.js';
import paymentsRouter from './payments.routes.js';

const app = express();
const api = express.Router();
const orders = express.Router();

orders.get('/', listOrders);
orders.get('/:id', getOrder);
orders.post(
  '/',
  validate(orderSchema),
  createOrder,
);
orders.del('/:id', deleteOrder);
orders
  .route('/:id/items')
  .get(listItems)
  .put(replaceItems);
orders.route('/:id/notes');
// orders.patch('/:id', patchOrder);

api.use('/orders', authenticate, orders);
api.use('/payments', paymentsRouter);
app.use('/api/v1', api);
app.use(express.json());
app.get('/health', (req, res) => res.send('ok'));
app.all('*', notFound);
const env = app.get('env');

export default app;
`;

describe('Express', () => {
  test('joins the prefixes of routers mounted in the same file', () => {
    expect(brief(serverRoutes(expressApp))).toEqual([
      '9 GET /api/v1/orders [express]',
      '10 GET /api/v1/orders/:id [express]',
      '11 POST /api/v1/orders [express]',
      '16 DELETE /api/v1/orders/:id [express]',
      '18 GET /api/v1/orders/:id/items [express]',
      '18 PUT /api/v1/orders/:id/items [express]',
      '21 ANY /api/v1/orders/:id/notes [express]',
      '25 ANY /api/v1/payments [express]',
      '28 GET /health [express]',
      '29 ANY * [express]',
    ]);
  });

  test('a router declared with a type annotation is a receiver too', () => {
    const typed = "const billing: Router = Router();\nbilling.get('/invoices', list);";
    expect(brief(serverRoutes(typed))).toEqual(['2 GET /invoices [express]']);
  });

  test('a call used as a value is not a registration', () => {
    const service = `const app = express();
app.get('/orders', listOrders);
export async function warmUp() {
  await app.get('/internal/cache');
  return api.get('/orders/stats');
}
const both = await Promise.all([api.get('/a'), api.get('/b')]);`;
    expect(brief(serverRoutes(service))).toEqual(['2 GET /orders [express]']);
  });

  test('an axios instance named like a router is a client', () => {
    const client = "const api = axios.create({ baseURL });\napi.get('/orders', { params });";
    expect(serverRoutes(client)).toEqual([]);
  });
});

describe('Fastify', () => {
  test('reads shorthand and route() registrations', () => {
    const plugin = `import Fastify from 'fastify';

const fastify = Fastify({ logger: true });

fastify.get('/orders/:id', { schema: getOrderSchema }, async (request, reply) => {
  return repo.find(request.params.id);
});
fastify.route({
  method: ['GET', 'HEAD'],
  url: '/orders',
  handler: listOrders,
});
fastify.route({
  url: '/orders/:id/events',
  handler: streamEvents,
});
fastify.route({ method: 'POST', handler: missingUrl });

await fastify.listen({ port: 3000 });
`;
    expect(brief(serverRoutes(plugin))).toEqual([
      '5 GET /orders/:id [fastify]',
      '8 GET /orders [fastify]',
      '8 HEAD /orders [fastify]',
      '13 ANY /orders/:id/events [fastify]',
    ]);
  });
});
