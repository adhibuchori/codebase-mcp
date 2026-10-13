/** Tests for outgoing HttpClient calls in C#. */
import { describe, expect, test } from 'bun:test';
import { httpClientCalls } from '../http-client.ts';

describe('httpClientCalls', () => {
  test('reads HttpClient calls and request messages, keeping interpolation holes', () => {
    const csharp = `public sealed class InventoryClient(HttpClient http, IDistributedCache cache)
{
    public async Task<Stock?> GetStockAsync(string sku)
    {
        var cached = await cache.GetStringAsync("stock");
        var reserved = await inventory.DeleteAsync("api/reservations/42");
        var all = await http.GetAsync("stock");
        var stock = await http.GetFromJsonAsync<Stock>($"api/stock/{sku}");
        await _httpClient.PostAsJsonAsync("api/reservations", new { sku });
        await _ordersApi.DeleteAsync(@"api/reservations/" + sku);
        await _httpClient.PutAsync("api/stock/{sku}", content);
        var payload = await _client.GetStringAsync("https://catalog.internal/api/items");
        var request = new HttpRequestMessage(HttpMethod.Patch, $"https://inventory.internal/api/stock/{sku}");
        return stock;
    }
}
`;
    expect(
      httpClientCalls(csharp).map(
        (r) => `${r.line} ${r.kind}/${r.role} ${r.method} ${r.pattern} ${r.framework}`,
      ),
    ).toEqual([
      '6 client/caller DELETE api/reservations/42 httpclient',
      '7 client/caller GET stock httpclient',
      '8 client/caller GET api/stock/{sku} httpclient',
      '9 client/caller POST api/reservations httpclient',
      '10 client/caller DELETE api/reservations/ httpclient',
      '11 client/caller PUT api/stock/{sku} httpclient',
      '12 client/caller GET https://catalog.internal/api/items httpclient',
      '13 client/caller PATCH https://inventory.internal/api/stock/{sku} httpclient',
    ]);
  });
});
