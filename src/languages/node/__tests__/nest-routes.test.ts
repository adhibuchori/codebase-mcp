/** NestJS controllers, each with its own prefix, and microservice handlers (topics and gRPC). */
import { describe, expect, test } from 'bun:test';
import type { RouteDef } from '../../../core/model/domain.types.ts';
import { nestRoutes } from '../nest-routes.ts';

const brief = (routes: readonly RouteDef[]): string[] =>
  routes.map(
    (route) => `${route.line} ${route.kind}/${route.role} ${route.method} ${route.pattern}`,
  );

describe('nestRoutes', () => {
  test('gives each controller in a file its own prefix', () => {
    const controllers = `import { Controller, Delete, Get, Param, Post } from '@nestjs/common';

@Controller('orders')
export class OrdersController {
  @Get()
  findAll() {}

  @Get(':id')
  findOne(@Param('id') id: string) {}

  @Post()
  @HttpCode(201)
  create(@Body() dto: CreateOrderDto) {}

  // @Delete(':id')
  // remove() {}

  @All(['export', 'export.csv'])
  export() {}
}

@Controller({ path: 'admin/orders', version: '2' })
export class AdminOrdersController {
  @Delete(':id')
  remove() {}
}
`;
    expect(brief(nestRoutes(controllers))).toEqual([
      '5 http/handler GET /orders',
      '8 http/handler GET /orders/:id',
      '11 http/handler POST /orders',
      '18 http/handler ANY /orders/export',
      '18 http/handler ANY /orders/export.csv',
      '24 http/handler DELETE /admin/orders/:id',
    ]);
    expect(nestRoutes(controllers)[0]?.framework).toBe('nestjs');
  });

  test('routes before any controller get no prefix', () => {
    expect(brief(nestRoutes("@Get('health')\ncheck() {}"))).toEqual(['1 http/handler GET /health']);
  });

  test('reads microservice topics and gRPC methods', () => {
    const microservice = `@Controller()
export class OrdersMicroservice {
  @MessagePattern({ cmd: 'get_order' })
  getOrder(data: { id: string }) {}

  @EventPattern('order_created')
  async handleCreated(event: OrderCreated) {}

  @GrpcMethod('OrderService', 'FindOne')
  findOne(data: OrderById) {}

  @GrpcMethod('OrderService')
  @UseInterceptors(GrpcLogging)
  async listOrders(request: ListOrdersRequest) {}

  @GrpcStreamMethod('OrderService')
  @GrpcMethod()
  streamOrders(messages: Observable<OrderById>) {}
}
`;
    expect(brief(nestRoutes(microservice))).toEqual([
      "3 topic/consumer  { cmd: 'get_order' }",
      '6 topic/consumer  order_created',
      '9 grpc/handler RPC OrderService/FindOne',
      '12 grpc/handler RPC OrderService/ListOrders',
      '16 grpc/handler RPC OrderService/StreamOrders',
    ]);
  });

  test('names the method * when no declaration follows the decorator', () => {
    expect(brief(nestRoutes("@GrpcMethod('HealthService')"))).toEqual([
      '1 grpc/handler RPC HealthService/*',
    ]);
  });
});
