/** Outgoing HTTP calls through requests, httpx and aiohttp, URL literals as written. */
import { describe, expect, test } from 'bun:test';
import type { RouteDef } from '../../../core/model/domain.types.ts';
import { pythonClientCalls } from '../client-calls.ts';

const brief = (routes: readonly RouteDef[]): string[] =>
  routes.map((route) => `${route.line} ${route.method} ${route.pattern} [${route.framework}]`);

describe('pythonClientCalls', () => {
  test('reads requests and httpx calls, f-string placeholders kept', () => {
    const client = `import httpx
import requests

def fetch_order(order_id: int) -> dict:
    response = requests.get(f"{settings.ORDERS_URL}/orders/{order_id}", timeout=5)
    requests.request("DELETE", f"{BASE}/reservations/{order_id}")
    # requests.get("https://legacy.internal/orders")
    return response.json()

async def notify(order_id: int) -> None:
    async with httpx.AsyncClient(timeout=10) as client:
        await client.post("/notifications", json={"order_id": order_id})
    await httpx.AsyncClient().put('https://audit.internal/events', json={})
    httpx.get(STATUS_URL)
    cache.get("orders:42")
`;
    expect(brief(pythonClientCalls(client))).toEqual([
      '5 GET {settings.ORDERS_URL}/orders/{order_id} [requests]',
      '6 DELETE {BASE}/reservations/{order_id} [requests]',
      '12 POST /notifications [httpx]',
      '13 PUT https://audit.internal/events [httpx]',
    ]);
  });

  test('names a session after the library the file imports', () => {
    const aiohttp =
      'import aiohttp\n\nasync def get(session):\n    async with session.get("https://rates.internal/v1/rates") as r:\n        return await r.json()';
    expect(brief(pythonClientCalls(aiohttp))).toEqual([
      '4 GET https://rates.internal/v1/rates [aiohttp]',
    ]);
    const plain = 'self._session.patch("/orders/1", json=body)\nclient.get("orders:42")';
    expect(brief(pythonClientCalls(plain))).toEqual(['1 PATCH /orders/1 [requests]']);
  });
});
