/** Tests for outgoing net/http calls in Go. */
import { describe, expect, test } from 'bun:test';
import { goClientCalls } from '../http-client.ts';

describe('goClientCalls', () => {
  test('reads helper calls and built requests, keeping the URL literal as written', () => {
    const go = `package inventory

func (c *Client) Stock(ctx context.Context, sku string) (*Stock, error) {
	resp, err := http.Get("https://inventory.internal/api/stock/" + sku)
	_, _ = c.httpClient.Post(c.baseURL+"/api/reservations", "application/json", body)
	_, _ = http.PostForm("http://legacy/api/forms", values)
	_, _ = client.Head("http://inventory.internal/healthz")
	req, _ := http.NewRequestWithContext(ctx, http.MethodPatch, "http://inventory.internal/api/stock/"+sku, body)
	del, _ := http.NewRequestWithContext(r.Context(), "DELETE", baseURL+"/api/reservations/"+id, nil)
	get, _ := http.NewRequest(http.MethodGet, "http://inventory.internal/api/items", nil)
	cached, _ := cache.Get("stock:" + sku)
	value := params.Get("sku")
	return nil, err
}
`;
    expect(
      goClientCalls(go).map(
        (r) => `${r.line} ${r.kind}/${r.role} ${r.method} ${r.pattern} ${r.framework}`,
      ),
    ).toEqual([
      '4 client/caller GET https://inventory.internal/api/stock/ net-http',
      '5 client/caller POST /api/reservations net-http',
      '6 client/caller POST http://legacy/api/forms net-http',
      '7 client/caller HEAD http://inventory.internal/healthz net-http',
      '8 client/caller PATCH http://inventory.internal/api/stock/ net-http',
      '9 client/caller DELETE /api/reservations/ net-http',
      '10 client/caller GET http://inventory.internal/api/items net-http',
    ]);
  });
});
