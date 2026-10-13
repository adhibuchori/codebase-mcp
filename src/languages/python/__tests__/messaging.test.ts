/** Kafka topics (kafka-python, aiokafka, confluent-kafka) and grpcio services. */
import { describe, expect, test } from 'bun:test';
import type { RouteDef } from '../../../core/model/domain.types.ts';
import { pythonMessaging } from '../messaging.ts';

const brief = (routes: readonly RouteDef[]): string[] =>
  routes.map(
    (route) => `${route.line} ${route.kind}/${route.role} ${route.pattern} [${route.framework}]`,
  );

describe('Kafka', () => {
  test('kafka-python consumers and producers', () => {
    const worker = `from kafka import KafkaConsumer, KafkaProducer

consumer = KafkaConsumer("orders.created", "orders.cancelled", bootstrap_servers="kafka:9092", group_id="billing")
late = KafkaConsumer(bootstrap_servers="kafka:9092")
late.subscribe(topics=["payments.settled"])
pubsub.subscribe("cache-invalidation")
producer = KafkaProducer(bootstrap_servers="kafka:9092")
producer.send("invoices.issued", value=invoice)
self.producer.send(topic=settings.AUDIT_TOPIC, value=event)
# producer.send("orders.legacy", value=event)
`;
    expect(brief(pythonMessaging(worker))).toEqual([
      '3 topic/consumer orders.created [kafka-python]',
      '3 topic/consumer orders.cancelled [kafka-python]',
      '5 topic/consumer payments.settled [kafka-python]',
      '8 topic/producer invoices.issued [kafka-python]',
      '9 topic/producer settings.AUDIT_TOPIC [kafka-python]',
    ]);
  });

  test('confluent-kafka subscriptions, patterns and constants', () => {
    const worker = `from confluent_kafka import Consumer, Producer

consumer = Consumer({"bootstrap.servers": "kafka:9092", "group.id": "shipping"})
consumer.subscribe(["orders.paid", "^inventory\\\\..*"])
retry_consumer.subscribe([RETRY_TOPIC])
producer.produce("shipments.created", key=order_id, value=payload)
producer.produce(
    SHIPMENTS_TOPIC,
    value=payload,
)
producer.produce(**kwargs)
`;
    expect(brief(pythonMessaging(worker))).toEqual([
      '4 topic/consumer orders.paid [confluent-kafka]',
      '4 topic/consumer ^inventory\\\\..* [confluent-kafka]',
      '5 topic/consumer RETRY_TOPIC [confluent-kafka]',
      '6 topic/producer shipments.created [confluent-kafka]',
      '7 topic/producer SHIPMENTS_TOPIC [confluent-kafka]',
    ]);
  });

  test('aiokafka consumers and producers', () => {
    const worker = `from aiokafka import AIOKafkaConsumer, AIOKafkaProducer

consumer = AIOKafkaConsumer("orders.created", bootstrap_servers=BROKERS)
await producer.send_and_wait("orders.audited", event)
consumer.subscribe()
`;
    expect(brief(pythonMessaging(worker))).toEqual([
      '3 topic/consumer orders.created [aiokafka]',
      '4 topic/producer orders.audited [aiokafka]',
    ]);
  });
});

describe('gRPC', () => {
  test('servers and stubs, not the generated module that defines both', () => {
    const server = `import grpc
from orders.v1 import orders_pb2_grpc

server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
orders_pb2_grpc.add_OrderServiceServicer_to_server(OrderService(), server)
payments = payments_pb2_grpc.PaymentServiceStub(channel)
`;
    expect(brief(pythonMessaging(server))).toEqual([
      '5 grpc/handler OrderService/* [grpc-python]',
      '6 grpc/caller PaymentService/* [grpc-python]',
    ]);
    const generated =
      'class OrderServiceStub(object):\n    pass\n\ndef add_OrderServiceServicer_to_server(servicer, server):\n    pass';
    expect(pythonMessaging(generated)).toEqual([]);
  });
});
