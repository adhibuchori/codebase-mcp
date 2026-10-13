/** Tests for the Java pack: regex symbols, framework rules, log calls and route extractors. */
import { describe, expect, test } from 'bun:test';
import { javaPack } from '../pack.ts';

/** The first pattern that names each line, as the regex symbol fallback applies them. */
function symbolsOf(source: string): string[] {
  return source.split('\n').flatMap((line) => {
    for (const pattern of javaPack.symbolPatterns ?? []) {
      const name = pattern.regex.exec(line)?.[1];
      if (name) return [`${pattern.kind} ${name}`];
    }
    return [];
  });
}

const detect = (path: string, content: string): string[] =>
  (javaPack.frameworks ?? [])
    .filter((rule) => rule.file.test(path) && rule.contains.test(content))
    .map((rule) => rule.name);

describe('javaPack', () => {
  test('describes Java', () => {
    expect(javaPack).toMatchObject({
      id: 'java',
      name: 'Java',
      tier: 1,
      extensions: ['.java'],
      grammar: 'java',
    });
  });

  test('finds classes, interfaces, enums, records and methods, but not calls or statements', () => {
    const source = `public final class OrderService implements Orders {
    public @interface Audited {}
    sealed interface Event permits Created {}
    public enum Status { OPEN, CANCELLED }
    public record OrderDto(String id, Status status) {}
    private final Map<String, List<Order>> byCustomer = new HashMap<>();

    @Override
    public Map<String, List<Order>> groupByCustomer(List<Order> orders) {
        return group(orders);
    }
    public static <T> T convert(Object value, Class<T> type) {
        else if (value == null) {
        Order order = repository.findById(id);
        throw new IllegalStateException("closed");
    }
    byte[] read() throws IOException;
    public OrderService(OrderRepository repository) {}
}
`;
    expect(symbolsOf(source)).toEqual([
      'class OrderService',
      'interface Audited',
      'interface Event',
      'enum Status',
      'record OrderDto',
      'method groupByCustomer',
      'method convert',
      'method read',
      'method OrderService',
    ]);
  });

  test('detects frameworks in a Maven pom and in Gradle build files', () => {
    const pom = `<project>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.2.5</version>
  </parent>
  <dependencies>
    <dependency>
      <groupId>org.springframework.cloud</groupId>
      <artifactId>spring-cloud-starter-openfeign</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.kafka</groupId>
      <artifactId>spring-kafka</artifactId>
    </dependency>
    <dependency>
      <groupId>net.devh</groupId>
      <artifactId>grpc-server-spring-boot-starter</artifactId>
    </dependency>
  </dependencies>
</project>`;
    expect(detect('services/orders/pom.xml', pom)).toEqual([
      'spring-boot',
      'spring-cloud-openfeign',
      'spring-kafka',
      'grpc',
    ]);
    const quarkus = `plugins {\n    id 'io.quarkus'\n}\ndependencies {\n    implementation 'io.grpc:grpc-stub:1.63.0'\n}\n`;
    expect(detect('build.gradle', quarkus)).toEqual(['quarkus', 'grpc']);
    const micronaut = 'plugins {\n    id("io.micronaut.application") version "4.3.6"\n}\n';
    expect(detect('app/build.gradle.kts', micronaut)).toEqual(['micronaut']);
    expect(detect('package.json', pom)).toEqual([]);
  });

  test('recognises logger and throw statements', () => {
    expect(
      javaPack.logCall?.test('        log.error("Order {} could not be cancelled", id, ex);'),
    ).toBe(true);
    expect(javaPack.logCall?.test('        LOGGER.warn("Retrying payment {}", paymentId);')).toBe(
      true,
    );
    expect(
      javaPack.logCall?.test(
        '        throw new OrderNotFoundException("Order " + id + " not found");',
      ),
    ).toBe(true);
    expect(javaPack.logCall?.test('        catalog.info("not a logger");')).toBe(false);
  });

  test('runs the Spring and messaging extractors', () => {
    const controller = `@RestController
@RequestMapping("/api")
class OrderController {
    @KafkaListener(topics = "orders")
    void onOrder(String payload) {}

    @GetMapping("/orders")
    List<Order> list() { return List.of(); }
}
`;
    const routes = (javaPack.routeExtractors ?? []).flatMap((extract) => extract(controller));
    expect(routes.map((route) => `${route.kind} ${route.pattern}`)).toEqual([
      'http /api/orders',
      'topic orders',
    ]);
  });
});
