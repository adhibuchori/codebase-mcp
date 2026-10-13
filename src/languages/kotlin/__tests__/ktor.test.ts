/** Tests for Ktor routing DSL extraction. */
import { describe, expect, test } from 'bun:test';
import type { RouteDef } from '../../../core/model/domain.types.ts';
import { ktorRoutes } from '../ktor.ts';

const summary = (routes: readonly RouteDef[]): string[] =>
  routes.map((r) => `${r.line} ${r.method} ${r.pattern} ${r.framework}`);

describe('ktorRoutes', () => {
  test('resolves nested route blocks by brace depth', () => {
    const kotlin = `fun Application.configureRouting(service: OrderService) {
    routing {
        get("/") {
            call.respondText("get { is text, not a route")
        }
        route("/api/orders") {
            get {
                call.respond(service.list())
            }
            get("/{id}") { call.respond(service.get(call.parameters["id"]!!)) }
            route("/{id}/items") {
                delete("/{itemId}") {
                    call.respond(HttpStatusCode.NoContent)
                }
            }
            post {
                call.respond(HttpStatusCode.Created, service.create(call.receive()))
            }
        }
        // get("/commented-out") { }
        authenticate("auth-jwt") {
            put("/profile") { call.respond(HttpStatusCode.OK) }
        }
    }
}
`;
    expect(summary(ktorRoutes(kotlin))).toEqual([
      '3 GET / ktor',
      '7 GET /api/orders ktor',
      '10 GET /api/orders/{id} ktor',
      '12 DELETE /api/orders/{id}/items/{itemId} ktor',
      '16 POST /api/orders ktor',
      '22 PUT /profile ktor',
    ]);
  });

  test('reads route extension functions and ignores map lookups and getters', () => {
    const kotlin = `fun Route.paymentRoutes() {
    route("/payments") {
        patch("/{id}") { call.respond(HttpStatusCode.OK) }
    }
    val cached = cache.get("payments") { load() }
    val size: Int get() { return 1 }
}
`;
    expect(summary(ktorRoutes(kotlin))).toEqual(['3 PATCH /payments/{id} ktor']);
  });
});
