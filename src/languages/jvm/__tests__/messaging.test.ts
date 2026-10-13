/** Tests for JVM topics and gRPC services: Spring Kafka, Spring AMQP, Kafka records and grpc-java. */
import { describe, expect, test } from 'bun:test';
import type { RouteDef } from '../../../core/model/domain.types.ts';
import { jvmMessaging } from '../messaging.ts';

const summary = (routes: readonly RouteDef[]): string[] =>
  routes.map((r) => `${r.line} ${r.kind}/${r.role} ${r.method} ${r.pattern} ${r.framework}`);

describe('jvmMessaging listeners', () => {
  test('reads every way @KafkaListener names its topics', () => {
    const java = `@Component
public class OrderEvents {
    @KafkaListener(topics = "\${app.topics.orders}", groupId = "billing")
    public void onOrder(OrderEvent event) {}

    @KafkaListener(topics = {"payments", "refunds"}, containerFactory = "batchFactory")
    public void onPayment(List<PaymentEvent> events) {}

    @KafkaListener(topicPattern = "audit\\\\..*")
    public void onAudit(String payload) {}

    @KafkaListener(id = "shipments", topicPartitions = @TopicPartition(topic = "shipments", partitions = {"0", "1"}))
    public void onShipment(String payload) {}

    @KafkaListener("legacy-orders")
    public void onLegacy(String payload) {}

    @KafkaListener(topics = Topics.INVOICES)
    public void onInvoice(String payload) {}
}
`;
    expect(summary(jvmMessaging(java))).toEqual([
      '3 topic/consumer  ${app.topics.orders} spring-kafka',
      '6 topic/consumer  payments spring-kafka',
      '6 topic/consumer  refunds spring-kafka',
      '9 topic/consumer  audit\\..* spring-kafka',
      '12 topic/consumer  shipments spring-kafka',
      '15 topic/consumer  legacy-orders spring-kafka',
      '18 topic/consumer  Topics.INVOICES spring-kafka',
    ]);
  });

  test('reads @RabbitListener queues, including Kotlin arrays and declared bindings', () => {
    const kotlin = `@Component
class InventoryListener {
    @RabbitListener(queues = ["inventory.reserve", "inventory.release"])
    fun onReserve(message: Message) {}

    @RabbitListener(bindings = [QueueBinding(value = Queue(value = "ignored"))])
    fun noAt(message: Message) {}

    @RabbitListener(bindings = @QueueBinding(value = @Queue(value = "inventory.audit", durable = "true"), exchange = @Exchange("inventory")))
    fun onAudit(message: Message) {}
}
`;
    expect(summary(jvmMessaging(kotlin))).toEqual([
      '3 topic/consumer  inventory.reserve rabbitmq',
      '3 topic/consumer  inventory.release rabbitmq',
      '9 topic/consumer  inventory.audit rabbitmq',
    ]);
  });
});

describe('jvmMessaging producers', () => {
  test('reads template sends and producer records, and ignores calls that name no topic', () => {
    const java = `public class OrderPublisher {
    public void publish(Order order) {
        kafkaTemplate.send(ORDERS_TOPIC, order.id(), order);
        kafkaTemplate.send("order-events", order);
        template.send("order-audit", order);
        kafkaTemplate.send(message);
        kafkaTemplate.send(new ProducerRecord<>("raw-orders", order.id(), order));
        rabbitTemplate.convertAndSend("orders.exchange", "orders.created", order);
        amqpTemplate.send("orders.dlx", "orders.dead", message);
        mailSender.send("ops@acme.io", report);
        jmsTemplate.convertAndSend("orders.queue", order);
    }
}
`;
    expect(summary(jvmMessaging(java))).toEqual([
      '3 topic/producer  ORDERS_TOPIC spring-kafka',
      '4 topic/producer  order-events spring-kafka',
      '5 topic/producer  order-audit spring-kafka',
      '7 topic/producer  raw-orders kafka',
      '8 topic/producer  orders.exchange rabbitmq',
      '9 topic/producer  orders.dlx rabbitmq',
    ]);
  });

  test('reads Scala producer records', () => {
    const scala = 'producer.send(new ProducerRecord[String, String]("clicks", key, value))';
    expect(summary(jvmMessaging(scala))).toEqual(['1 topic/producer  clicks kafka']);
  });
});

describe('jvmMessaging gRPC services', () => {
  test('reads grpc-java implementations and stubs in Java, Kotlin and Scala', () => {
    const java = `import com.acme.orders.v1.OrderServiceGrpc.OrderServiceImplBase;

public class OrderGrpcService extends OrderServiceGrpc.OrderServiceImplBase {
    private final InventoryServiceGrpc.InventoryServiceBlockingStub inventory =
        InventoryServiceGrpc.newBlockingStub(channel);
    private final PaymentServiceGrpc.PaymentServiceFutureStub payments = PaymentServiceGrpc.newFutureStub(channel);
}
`;
    const kotlin = `class ShippingService : ShippingServiceGrpcKt.ShippingServiceCoroutineImplBase() {
    private val tracking = TrackingServiceGrpcKt.TrackingServiceCoroutineStub(channel)
}
`;
    const scala = `val service = PricingServiceGrpc.bindService(new PricingServiceImpl, ec)
val stub = CatalogServiceGrpc.blockingStub(channel)
`;
    expect(summary(jvmMessaging(java))).toEqual([
      '3 grpc/handler RPC OrderService/* grpc-java',
      '5 grpc/caller RPC InventoryService/* grpc-java',
      '6 grpc/caller RPC PaymentService/* grpc-java',
    ]);
    expect(summary(jvmMessaging(kotlin))).toEqual([
      '1 grpc/handler RPC ShippingService/* grpc-java',
      '2 grpc/caller RPC TrackingService/* grpc-java',
    ]);
    expect(summary(jvmMessaging(scala))).toEqual([
      '1 grpc/handler RPC PricingService/* grpc-java',
      '2 grpc/caller RPC CatalogService/* grpc-java',
    ]);
  });
});
