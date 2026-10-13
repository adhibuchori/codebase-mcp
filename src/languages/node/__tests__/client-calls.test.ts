/** Outgoing HTTP calls: axios (direct, config and instances), fetch, got and ky. */
import { describe, expect, test } from 'bun:test';
import type { RouteDef } from '../../../core/model/domain.types.ts';
import { clientCalls, clientInstances } from '../client-calls.ts';

const brief = (routes: readonly RouteDef[]): string[] =>
  routes.map(
    (route) =>
      `${route.line} ${route.kind}/${route.role} ${route.method} ${route.pattern} [${route.framework}]`,
  );

const paymentsClient = `import axios from 'axios';
import got from 'got';
import ky from 'ky';

const payments = axios.create({ baseURL: process.env.PAYMENTS_URL, timeout: 5000 });
const inventory: AxiosInstance = axios.create({ baseURL: INVENTORY_URL });

export async function refund(orderId: string, amount: number) {
  const { data } = await payments.post<Refund>(\`/refunds/\${orderId}\`, { amount });
  await axios.get('https://audit.internal/api/events', { params: { orderId } });
  await inventory.delete(\`/reservations/\${orderId}\`);
  // await axios.get('/legacy/refunds');
  return data;
}

export const notify = (orderId) =>
  fetch(\`\${NOTIFY_URL}/orders/\${orderId}/notify\`, {
    method: 'post',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId }),
  });

export const status = () => fetch('/api/status');
export const report = (url) => fetch(url);
export const sync = () => axios({ method: 'put', url: '/inventory/sync', data: {} });
export const legacy = () => axios.request({ url: "/v1/legacy" });
export const rates = () => got('https://rates.internal/v2/rates', { method: 'GET' }).json();
export const shipping = () => ky.post('https://shipping.internal/quotes', { json: {} });
export const cached = () => cache.get('/orders/42');
`;

describe('clientCalls', () => {
  test('reads every client call with its method and URL as written', () => {
    expect(brief(clientCalls(paymentsClient))).toEqual([
      '9 client/caller POST /refunds/${orderId} [axios]',
      '10 client/caller GET https://audit.internal/api/events [axios]',
      '11 client/caller DELETE /reservations/${orderId} [axios]',
      '28 client/caller POST https://shipping.internal/quotes [ky]',
      '25 client/caller PUT /inventory/sync [axios]',
      '26 client/caller GET /v1/legacy [axios]',
      '17 client/caller POST ${NOTIFY_URL}/orders/${orderId}/notify [fetch]',
      '23 client/caller GET /api/status [fetch]',
      '27 client/caller GET https://rates.internal/v2/rates [got]',
    ]);
  });

  test('skips calls without a literal URL and config calls without one', () => {
    expect(
      clientCalls("fetch(url);\naxios({ method: 'get', url: endpoint });\naxios.get(path);"),
    ).toEqual([]);
  });
});

describe('clientInstances', () => {
  test('maps instance variables to their library', () => {
    const declared =
      "const api = axios.create({});\nlet search = ky.create({ prefixUrl: '/s' });\nconst g = got.extend({});";
    expect([...clientInstances(declared)]).toEqual([
      ['api', 'axios'],
      ['search', 'ky'],
      ['g', 'got'],
    ]);
  });
});
