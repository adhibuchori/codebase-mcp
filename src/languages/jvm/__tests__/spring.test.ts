/** Tests for annotation-declared JVM endpoints: Spring, JAX-RS, Feign and Retrofit. */
import { describe, expect, test } from 'bun:test';
import type { RouteDef } from '../../../core/model/domain.types.ts';
import { springRoutes } from '../spring.ts';

const summary = (routes: readonly RouteDef[]): string[] =>
  routes.map((r) => `${r.line} ${r.kind}/${r.role} ${r.method} ${r.pattern} ${r.framework}`);

const ORDER_CONTROLLER = `package com.acme.orders.api;

import org.springframework.web.bind.annotation.*;

/**
 * Orders API. A Javadoc mention such as {@code @GetMapping("/old")} is not a route.
 */
@RestController
@RequestMapping("/api/orders")
public class OrderController {

    // @GetMapping("/commented-out")
    @GetMapping
    public List<OrderDto> list() {
        return service.list();
    }

    @GetMapping("/{id}")
    public OrderDto get(@PathVariable String id) {
        return service.get(id);
    }

    @PostMapping(value = "/{id}/cancel", produces = MediaType.APPLICATION_JSON_VALUE)
    public void cancel(@PathVariable String id) {
        cache.put("order", id);
    }

    @RequestMapping(value = {"/search", "/find"}, method = {RequestMethod.GET, RequestMethod.POST})
    public List<OrderDto> search(@RequestParam String q) {
        return service.search(q);
    }

    @RequestMapping(
        path = "/legacy",
        method = RequestMethod.PUT
    )
    public void legacy() {}

    @RequestMapping("/any")
    public void any() {}

    static class Audit {
        @GetMapping("/audit")
        public void audit() {}
    }

    @DeleteMapping("{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String id) {}
}

@RestController
class HealthController {
    @GetMapping("/health")
    String health() { return "ok"; }
}
`;

describe('springRoutes on Spring MVC controllers', () => {
  test('joins the class prefix to every method mapping, with arrays and verb lists expanded', () => {
    expect(summary(springRoutes(ORDER_CONTROLLER))).toEqual([
      '13 http/handler GET /api/orders spring',
      '18 http/handler GET /api/orders/{id} spring',
      '23 http/handler POST /api/orders/{id}/cancel spring',
      '28 http/handler GET /api/orders/search spring',
      '28 http/handler GET /api/orders/find spring',
      '28 http/handler POST /api/orders/search spring',
      '28 http/handler POST /api/orders/find spring',
      '33 http/handler PUT /api/orders/legacy spring',
      '39 http/handler ANY /api/orders/any spring',
      '43 http/handler GET /audit spring',
      '47 http/handler DELETE /api/orders/{id} spring',
      '54 http/handler GET /health spring',
    ]);
  });

  test('reads Kotlin array arguments, varargs and annotations on the same line as the function', () => {
    const kotlin = `@RestController
@RequestMapping(path = ["/api/v1/payments"])
class PaymentController(
    private val service: PaymentService,
) {
    @GetMapping("/{id}") fun get(@PathVariable id: String) = service.get(id)

    @PostMapping("/charge", "/capture")
    suspend fun charge(@RequestBody request: ChargeRequest) = service.charge(request)

    @PutMapping(value = ["/{id}"], consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun update(@PathVariable id: String) {}
}
`;
    expect(summary(springRoutes(kotlin))).toEqual([
      '6 http/handler GET /api/v1/payments/{id} spring',
      '8 http/handler POST /api/v1/payments/charge spring',
      '8 http/handler POST /api/v1/payments/capture spring',
      '11 http/handler PUT /api/v1/payments/{id} spring',
    ]);
  });

  test('finds nothing in a class without mappings', () => {
    expect(
      springRoutes(
        '@Service\npublic class OrderService {\n  @Transactional\n  void save() {}\n}\n',
      ),
    ).toEqual([]);
  });
});

describe('springRoutes on declarative clients', () => {
  test('turns the mappings of a @FeignClient interface into calls under its path', () => {
    const feign = `@FeignClient(name = "inventory", url = "\${inventory.url}", path = "/api/inventory")
public interface InventoryClient {
    @GetMapping("/items/{sku}")
    ItemDto get(@PathVariable("sku") String sku);

    @RequestMapping(method = RequestMethod.POST, value = "/reservations")
    void reserve(@RequestBody Reservation reservation);
}
`;
    expect(summary(springRoutes(feign))).toEqual([
      '3 client/caller GET /api/inventory/items/{sku} feign',
      '6 client/caller POST /api/inventory/reservations feign',
    ]);
  });

  test("reads Feign's @RequestLine and Retrofit's verb annotations as written", () => {
    const clients = `public interface GitHub {
    @RequestLine("GET /repos/{owner}/{repo}/contributors")
    List<Contributor> contributors(@Param("owner") String owner, @Param("repo") String repo);

    @RequestLine("not a request line")
    void broken();
}

public interface GitHubService {
    @GET("users/{user}/repos")
    Call<List<Repo>> listRepos(@Path("user") String user);

    @POST("users/{user}/keys")
    Call<Key> addKey(@Path("user") String user, @Body Key key);
}
`;
    expect(summary(springRoutes(clients))).toEqual([
      '2 client/caller GET /repos/{owner}/{repo}/contributors feign',
      '10 client/caller GET users/{user}/repos retrofit',
      '13 client/caller POST users/{user}/keys retrofit',
    ]);
  });
});

describe('springRoutes on JAX-RS resources', () => {
  test('joins the class @Path to each verb, with the method @Path when there is one', () => {
    const resource = `@Path("/v2/orders")
@Produces(MediaType.APPLICATION_JSON)
public class OrderResource {
    @GET
    public List<Order> all() { return service.all(); }

    @GET
    @Path("{id}")
    public Order one(@PathParam("id") String id) { return service.one(id); }

    @Path("/items")
    public ItemResource items() { return new ItemResource(); }

    @POST @Path("/import")
    public Response importOrders(List<Order> orders) { return Response.ok().build(); }
}
`;
    expect(summary(springRoutes(resource))).toEqual([
      '4 http/handler GET /v2/orders jax-rs',
      '7 http/handler GET /v2/orders/{id} jax-rs',
      '14 http/handler POST /v2/orders/import jax-rs',
    ]);
  });
});

describe('springRoutes on outgoing calls', () => {
  test('adds RestTemplate and WebClient calls, ordered by line with the mappings', () => {
    const service = `@RestController
public class CheckoutController {
    @PostMapping("/checkout")
    public Receipt checkout(@RequestBody Cart cart) {
        Stock stock = restTemplate.getForObject("http://inventory/api/stock/{sku}", Stock.class, cart.sku());
        return webClient.post()
            .uri("http://payments/api/charges")
            .retrieve()
            .bodyToMono(Receipt.class)
            .block();
    }
}
`;
    expect(summary(springRoutes(service))).toEqual([
      '3 http/handler POST /checkout spring',
      '5 client/caller GET http://inventory/api/stock/{sku} resttemplate',
      '7 client/caller POST http://payments/api/charges webclient',
    ]);
  });
});
