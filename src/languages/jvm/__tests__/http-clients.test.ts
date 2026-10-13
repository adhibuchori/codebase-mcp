/** Tests for RestTemplate and WebClient call extraction. */
import { describe, expect, test } from 'bun:test';
import type { RouteDef } from '../../../core/model/domain.types.ts';
import { httpClientCalls } from '../http-clients.ts';

const summary = (routes: readonly RouteDef[]): string[] =>
  routes.map((r) => `${r.line} ${r.kind}/${r.role} ${r.method} ${r.pattern} ${r.framework}`);

describe('httpClientCalls with RestTemplate', () => {
  const java = `public class InventoryGateway {
    public Stock stock(String sku) {
        return restTemplate.getForObject("http://inventory/api/stock/{sku}", Stock.class, sku);
    }
    public void reserve(Reservation r) {
        restTemplate.postForEntity(baseUrl + "/api/reservations", r, Void.class);
        restTemplate.put("http://inventory/api/stock/{sku}", r, r.sku());
        restTemplate.delete("http://inventory/api/reservations/{id}", r.id());
        restTemplate.patchForObject("http://inventory/api/stock/{sku}", r, Stock.class, r.sku());
        template.exchange("http://billing/api/invoices/{id}", HttpMethod.DELETE, null, Void.class, r.id());
        restOperations.exchange("http://billing/api/invoices", entity, Invoice.class);
        attributes.put("sku", r.sku());
        repository.delete("orders");
    }
}
`;

  test('maps each method to its verb and keeps the URL literal as written', () => {
    expect(summary(httpClientCalls(java))).toEqual([
      '3 client/caller GET http://inventory/api/stock/{sku} resttemplate',
      '6 client/caller POST /api/reservations resttemplate',
      '7 client/caller PUT http://inventory/api/stock/{sku} resttemplate',
      '8 client/caller DELETE http://inventory/api/reservations/{id} resttemplate',
      '9 client/caller PATCH http://inventory/api/stock/{sku} resttemplate',
      '10 client/caller DELETE http://billing/api/invoices/{id} resttemplate',
      '11 client/caller ANY http://billing/api/invoices resttemplate',
    ]);
  });

  test("reads Kotlin's reified extension calls", () => {
    const kotlin =
      'val order = restTemplate.getForObject<OrderDto>("http://orders/api/orders/$id")';
    expect(summary(httpClientCalls(kotlin))).toEqual([
      '1 client/caller GET http://orders/api/orders/$id resttemplate',
    ]);
  });
});

describe('httpClientCalls with WebClient', () => {
  test('reports the line of the .uri() call and the verb of the chain', () => {
    const java = `public Mono<Receipt> charge(Charge charge) {
    return webClient
        .post()
        .uri("http://payments/api/charges")
        .bodyValue(charge)
        .retrieve()
        .bodyToMono(Receipt.class);
}

public Mono<Void> refund(String id) {
    return webClient.method(HttpMethod.PATCH).uri("http://payments/api/charges/{id}/refund", id).retrieve().bodyToMono(Void.class);
}

public Order fetch(String id) {
    return restClient.get().uri("/api/orders/{id}", id).retrieve().body(Order.class);
}
`;
    expect(summary(httpClientCalls(java))).toEqual([
      '4 client/caller POST http://payments/api/charges webclient',
      '11 client/caller PATCH http://payments/api/charges/{id}/refund webclient',
      '15 client/caller GET /api/orders/{id} webclient',
    ]);
  });

  test('skips a URI built by a function', () => {
    const java =
      'webClient.get().uri(builder -> builder.path("/orders/{id}").build(id)).retrieve();';
    expect(httpClientCalls(java)).toEqual([]);
  });
});
