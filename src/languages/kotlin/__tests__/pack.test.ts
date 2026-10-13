/** Tests for the Kotlin pack: regex symbols, Ktor detection, log calls and route extractors. */
import { describe, expect, test } from 'bun:test';
import { kotlinPack } from '../pack.ts';

/** The first pattern that names each line, as the regex symbol fallback applies them. */
function symbolsOf(source: string): string[] {
  return source.split('\n').flatMap((line) => {
    for (const pattern of kotlinPack.symbolPatterns ?? []) {
      const name = pattern.regex.exec(line)?.[1];
      if (name) return [`${pattern.kind} ${name}`];
    }
    return [];
  });
}

describe('kotlinPack', () => {
  test('describes Kotlin', () => {
    expect(kotlinPack).toMatchObject({
      id: 'kotlin',
      name: 'Kotlin',
      tier: 1,
      extensions: ['.kt', '.kts'],
      grammar: 'kotlin',
    });
  });

  test('finds classes, objects, interfaces and functions', () => {
    const source = `data class OrderDto(val id: String, val total: BigDecimal)
sealed class OrderEvent
enum class Status { OPEN, CANCELLED }
object OrderMapper {
    fun toDto(order: Order): OrderDto = OrderDto(order.id, order.total)
}
fun interface Validator { fun validate(order: Order) }
interface OrderRepository : CrudRepository<Order, String>
class OrderService(private val repository: OrderRepository) {
    companion object Factory {
        fun create(): OrderService = OrderService(InMemoryRepository())
    }
    suspend fun cancel(id: String) {}
    private inline fun <reified T> List<Order>.firstOf(): T? = null
    fun String.toOrderId(): String = trim()
}
`;
    expect(symbolsOf(source)).toEqual([
      'class OrderDto',
      'class OrderEvent',
      'class Status',
      'object OrderMapper',
      'function toDto',
      'interface Validator',
      'interface OrderRepository',
      'class OrderService',
      'object Factory',
      'function create',
      'function cancel',
      'function firstOf',
      'function toOrderId',
    ]);
  });

  test('detects Ktor in a Gradle Kotlin build file', () => {
    const gradle = 'dependencies {\n    implementation("io.ktor:ktor-server-netty:2.3.11")\n}\n';
    const found = (kotlinPack.frameworks ?? []).filter(
      (rule) => rule.file.test('build.gradle.kts') && rule.contains.test(gradle),
    );
    expect(found.map((rule) => rule.name)).toEqual(['ktor']);
  });

  test('recognises logger calls, kotlin-logging lambdas and throws', () => {
    expect(kotlinPack.logCall?.test('logger.error("Order $id could not be cancelled", ex)')).toBe(
      true,
    );
    expect(kotlinPack.logCall?.test('logger.warn { "Retrying payment $paymentId" }')).toBe(true);
    expect(kotlinPack.logCall?.test('throw IllegalStateException("Order $id is closed")')).toBe(
      true,
    );
    expect(kotlinPack.logCall?.test('val total = order.total')).toBe(false);
  });

  test('runs the Spring, messaging and Ktor extractors', () => {
    const source = `@RestController
class Health {
    @GetMapping("/health") fun health() = "ok"
}
fun Route.orders() {
    get("/orders") { call.respond(emptyList<String>()) }
}
`;
    const routes = (kotlinPack.routeExtractors ?? []).flatMap((extract) => extract(source));
    expect(routes.map((route) => `${route.framework} ${route.pattern}`)).toEqual([
      'spring /health',
      'ktor /orders',
    ]);
  });
});
