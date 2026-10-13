/** kafkajs producers and consumers, and @grpc/grpc-js servers and clients. */
import { describe, expect, test } from 'bun:test';
import type { RouteDef } from '../../../core/model/domain.types.ts';
import { messagingRoutes } from '../messaging.ts';

const brief = (routes: readonly RouteDef[]): string[] =>
  routes.map(
    (route) => `${route.line} ${route.kind}/${route.role} ${route.pattern} [${route.framework}]`,
  );

describe('kafkajs', () => {
  test('reads produced and consumed topics, constants and regexes as written', () => {
    const worker = `const kafka = new Kafka({ clientId: 'orders', brokers: ['kafka:9092'] });
const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'orders-worker' });

await producer.send({
  topic: 'orders.created',
  messages: [{ key: order.id, value: JSON.stringify(order) }],
});
await producer.sendBatch({
  topicMessages: [
    { topic: TOPICS.ORDER_SHIPPED, messages },
    { topic: "orders.audit", messages },
  ],
});
await consumer.subscribe({ topics: ['payments.settled', TOPICS.REFUNDS], fromBeginning: true });
await consumer.subscribe({ topic: /inventory\\..*/ });
// await producer.send({ topic: 'orders.legacy', messages });
orders$.subscribe({ next: render, error: report });
`;
    expect(brief(messagingRoutes(worker))).toEqual([
      '5 topic/producer orders.created [kafkajs]',
      '9 topic/producer TOPICS.ORDER_SHIPPED [kafkajs]',
      '9 topic/producer orders.audit [kafkajs]',
      '15 topic/consumer payments.settled [kafkajs]',
      '15 topic/consumer TOPICS.REFUNDS [kafkajs]',
      '16 topic/consumer /inventory\\..*/ [kafkajs]',
    ]);
  });
});

describe('@grpc/grpc-js', () => {
  test('reads served services and clients, with dynamic or generated definitions', () => {
    const grpcServer = `const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const orderProto = grpc.loadPackageDefinition(packageDefinition).orders.v1;

const server = new grpc.Server();
server.addService(orderProto.OrderService.service, { getOrder, listOrders });
server.addService(services.InventoryServiceService, new InventoryServer());

const payments = new orderProto.PaymentService(PAYMENTS_ADDR, grpc.credentials.createInsecure());
const shipping = new ShippingServiceClient('shipping:50051', credentials.createSsl());
const audit = new proto.AuditService(AUDIT_ADDR, creds);
const cache = new Map();
`;
    expect(brief(messagingRoutes(grpcServer))).toEqual([
      '5 grpc/handler OrderService/* [grpc-node]',
      '6 grpc/handler InventoryService/* [grpc-node]',
      '8 grpc/caller PaymentService/* [grpc-node]',
      '9 grpc/caller ShippingService/* [grpc-node]',
      '10 grpc/caller AuditService/* [grpc-node]',
    ]);
  });
});
