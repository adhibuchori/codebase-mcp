/** Tests for Go Kafka topics (kafka-go, sarama, confluent-kafka-go) and grpc-go services. */
import { describe, expect, test } from 'bun:test';
import type { RouteDef } from '../../../core/model/domain.types.ts';
import { goMessaging } from '../messaging.ts';
import { maskSource } from '../syntax.ts';

const summary = (code: string): string[] =>
  goMessaging(maskSource(code))
    .toSorted((a, b) => a.line - b.line)
    .map((r: RouteDef) => `${r.line} ${r.kind}/${r.role} ${r.pattern} ${r.framework}`);

describe('goMessaging with kafka-go and sarama', () => {
  test('reads Topic fields of writers, readers and messages on the field line', () => {
    const go = `package events

import "github.com/segmentio/kafka-go"

const paymentsTopic = "payments"

func setup(cfg Config) {
	w := &kafka.Writer{
		Addr:     kafka.TCP("localhost:9092"),
		Topic:    "orders",
		Balancer: &kafka.LeastBytes{},
	}
	r := kafka.NewReader(kafka.ReaderConfig{
		Brokers: []string{"localhost:9092"},
		GroupID: "billing",
		Topic:   paymentsTopic,
	})
	g := kafka.NewReader(kafka.ReaderConfig{GroupID: "audit", GroupTopics: []string{"audit", "audit-dlq"}})
	_ = w.WriteMessages(ctx, kafka.Message{Topic: cfg.Topics.Refunds, Value: payload})
	_ = w.WriteMessages(ctx, kafka.Message{Key: []byte("k"), Value: payload})
	legacy := kafka.NewWriter(kafka.WriterConfig{Brokers: brokers, Topic: "legacy"})
}
`;
    expect(summary(go)).toEqual([
      '10 topic/producer orders kafka-go',
      '16 topic/consumer payments kafka-go',
      '18 topic/consumer audit kafka-go',
      '18 topic/consumer audit-dlq kafka-go',
      '19 topic/producer cfg.Topics.Refunds kafka-go',
      '21 topic/producer legacy kafka-go',
    ]);
  });

  test('reads sarama producer messages, partition consumers and consumer groups', () => {
    const go = `package events

func run(ctx context.Context) {
	msg := &sarama.ProducerMessage{Topic: "invoices", Value: sarama.StringEncoder(body)}
	pc, _ := consumer.ConsumePartition("shipments", 0, sarama.OffsetNewest)
	err := group.Consume(ctx, []string{"refunds", "chargebacks"}, handler)
	err = group.Consume(context.Background(), topics, handler)
}
`;
    expect(summary(go)).toEqual([
      '4 topic/producer invoices sarama',
      '5 topic/consumer shipments sarama',
      '6 topic/consumer refunds sarama',
      '6 topic/consumer chargebacks sarama',
    ]);
  });
});

describe('goMessaging with confluent-kafka-go', () => {
  test('reads subscriptions and produced messages, resolving the topic pointer', () => {
    const go = `package events

import "github.com/confluentinc/confluent-kafka-go/v2/kafka"

func run(c *kafka.Consumer, p *kafka.Producer) {
	c.SubscribeTopics([]string{"orders", "payments"}, nil)
	c.Subscribe(topicName, nil)
	topic := "notifications"
	p.Produce(&kafka.Message{
		TopicPartition: kafka.TopicPartition{Topic: &topic, Partition: kafka.PartitionAny},
		Value:          []byte(body),
	}, nil)
}
`;
    expect(summary(go)).toEqual([
      '6 topic/consumer orders confluent-kafka',
      '6 topic/consumer payments confluent-kafka',
      '7 topic/consumer topicName confluent-kafka',
      '10 topic/producer notifications confluent-kafka',
    ]);
  });

  test('ignores Subscribe calls in files that do not import confluent-kafka-go', () => {
    expect(
      summary('nc.Subscribe("updates", func(m *nats.Msg) {})\nsub.Subscribe(subject, nil)\n'),
    ).toEqual([]);
  });

  test('reads a struct literal that never closes up to a bounded length', () => {
    expect(summary('w := kafka.Writer{\n\tTopic: "orders",\n')).toEqual([
      '2 topic/producer orders kafka-go',
    ]);
  });
});

describe('goMessaging with grpc-go', () => {
  test('reads server registrations and client constructors, not gateway handlers or other clients', () => {
    const go = `package main

func main() {
	s := grpc.NewServer()
	pb.RegisterOrderServiceServer(s, &server{})
	healthpb.RegisterHealthServer(s, health.NewServer())
	pb.RegisterOrderServiceHandlerServer(ctx, gwmux, &server{})
	inventory := inventorypb.NewInventoryServiceClient(conn)
	payments := paymentsv1.NewPaymentsClient(c.conn)
	rdb := redis.NewClusterClient(&redis.ClusterOptions{Addrs: addrs})
	kms, _ := kmsapi.NewKeyManagementClient(ctx)
}
`;
    expect(summary(go)).toEqual([
      '5 grpc/handler OrderService/* grpc-go',
      '6 grpc/handler Health/* grpc-go',
      '8 grpc/caller InventoryService/* grpc-go',
      '9 grpc/caller Payments/* grpc-go',
    ]);
  });
});
