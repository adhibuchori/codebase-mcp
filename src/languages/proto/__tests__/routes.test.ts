/** Every rpc inside a service block is a gRPC method definition "Service/Method". */
import { describe, expect, test } from 'bun:test';
import { protoRoutes } from '../routes.ts';

describe('protoRoutes', () => {
  test('defines each rpc of each service', () => {
    const proto = `syntax = "proto3";

package shop.orders.v1;

message GetOrderRequest {
  string id = 1;
}

service OrderService {
  rpc GetOrder (GetOrderRequest) returns (Order);
  rpc ListOrders(ListOrdersRequest) returns (stream Order) {
    option (google.api.http) = {
      get: "/v1/orders"
    };
  }
  // rpc LegacyOrders(Empty) returns (Empty);
  rpc CancelOrder(CancelOrderRequest) returns (Order);
}

service PaymentService {
  rpc Refund(RefundRequest) returns (RefundReply);
}

rpc Orphan(Empty) returns (Empty);
`;
    expect(protoRoutes(proto)).toEqual([
      {
        kind: 'grpc',
        role: 'definition',
        method: 'RPC',
        pattern: 'OrderService/GetOrder',
        line: 10,
        framework: 'protobuf',
      },
      {
        kind: 'grpc',
        role: 'definition',
        method: 'RPC',
        pattern: 'OrderService/ListOrders',
        line: 11,
        framework: 'protobuf',
      },
      {
        kind: 'grpc',
        role: 'definition',
        method: 'RPC',
        pattern: 'OrderService/CancelOrder',
        line: 17,
        framework: 'protobuf',
      },
      {
        kind: 'grpc',
        role: 'definition',
        method: 'RPC',
        pattern: 'PaymentService/Refund',
        line: 21,
        framework: 'protobuf',
      },
    ]);
  });
});
