/** The Node route extractor merges every kind of route in line order. */
import { describe, expect, test } from 'bun:test';
import { nodeRoutes } from '../routes.ts';

describe('nodeRoutes', () => {
  test('merges handlers, calls, topics and gRPC services by line', () => {
    const service = `@Controller('orders')
export class OrdersController {
  @Post(':id/cancel')
  async cancel(@Param('id') id: string) {
    await this.producer.send({ topic: 'orders.cancelled', messages: [{ value: id }] });
    return axios.post(\`\${PAYMENTS_URL}/refunds\`, { orderId: id });
  }
}
const router = express.Router();
router.get('/health', (req, res) => res.send('ok'));
server.addService(proto.OrderService.service, handlers);
`;
    expect(
      nodeRoutes(service).map(
        (route) => `${route.line} ${route.kind} ${route.method} ${route.pattern}`,
      ),
    ).toEqual([
      '3 http POST /orders/:id/cancel',
      '5 topic  orders.cancelled',
      '6 client POST ${PAYMENTS_URL}/refunds',
      '10 http GET /health',
      '11 grpc RPC OrderService/*',
    ]);
  });
});
