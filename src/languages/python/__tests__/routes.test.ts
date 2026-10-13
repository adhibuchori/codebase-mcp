/** The Python route extractor merges handlers, calls and topics in line order. */
import { describe, expect, test } from 'bun:test';
import { pythonRoutes } from '../routes.ts';

describe('pythonRoutes', () => {
  test('merges every kind of route by line', () => {
    const service = `from fastapi import APIRouter

producer.send("orders.viewed", value=event)
router = APIRouter(prefix="/orders")

@router.get("/{order_id}")
async def get_order(order_id: int):
    return requests.get(f"{CATALOG_URL}/items/{order_id}").json()
`;
    expect(
      pythonRoutes(service).map((route) => `${route.line} ${route.kind} ${route.pattern}`),
    ).toEqual([
      '3 topic orders.viewed',
      '6 http /orders/{order_id}',
      '8 client {CATALOG_URL}/items/{order_id}',
    ]);
  });
});
