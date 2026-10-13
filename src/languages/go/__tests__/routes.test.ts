/** Tests for the combined Go route extractor. */
import { describe, expect, test } from 'bun:test';
import { goRoutes } from '../routes.ts';

describe('goRoutes', () => {
  test('combines handlers, calls, topics and gRPC services in line order', () => {
    const go = `package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/segmentio/kafka-go"
)

func main() {
	writer := &kafka.Writer{Addr: kafka.TCP(broker), Topic: "orders.created"}
	r := gin.Default()
	r.POST("/orders", func(c *gin.Context) {
		resp, err := http.Get("http://inventory/api/stock")
		_ = writer.WriteMessages(c, kafka.Message{Value: body})
	})
	pb.RegisterOrderServiceServer(grpcServer, &orderServer{})
}
`;
    expect(
      goRoutes(go).map(
        (r) => `${r.line} ${r.kind}/${r.role} ${r.method} ${r.pattern} ${r.framework}`,
      ),
    ).toEqual([
      '11 topic/producer  orders.created kafka-go',
      '13 http/handler POST /orders gin',
      '14 client/caller GET http://inventory/api/stock net-http',
      '17 grpc/handler RPC OrderService/* grpc-go',
    ]);
  });

  test('finds nothing in a file without routes', () => {
    expect(goRoutes('package util\n\nfunc Add(a, b int) int { return a + b }\n')).toEqual([]);
  });
});
