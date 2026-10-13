/** Tests for the Scala pack: regex symbols and the messaging extractor. */
import { describe, expect, test } from 'bun:test';
import { scalaPack } from '../pack.ts';

/** The first pattern that names each line, as the regex symbol fallback applies them. */
function symbolsOf(source: string): string[] {
  return source.split('\n').flatMap((line) => {
    for (const pattern of scalaPack.symbolPatterns ?? []) {
      const name = pattern.regex.exec(line)?.[1];
      if (name) return [`${pattern.kind} ${name}`];
    }
    return [];
  });
}

describe('scalaPack', () => {
  test('describes Scala at tier 2', () => {
    expect(scalaPack).toMatchObject({
      id: 'scala',
      name: 'Scala',
      tier: 2,
      extensions: ['.scala', '.sc'],
      grammar: 'scala',
    });
  });

  test('finds classes, objects, traits and defs', () => {
    const source = `sealed trait OrderEvent
final case class OrderCreated(id: String) extends OrderEvent
private[orders] class OrderRepository(db: Database) {
  def find(id: String): Future[Option[Order]] = db.run(query(id))
  private[this] def query(id: String) = orders.filter(_.id === id)
  override def toString: String = "OrderRepository"
}
case object Cancelled extends OrderEvent
object OrderService {
  implicit val timeout: Timeout = Timeout(5.seconds)
}
`;
    expect(symbolsOf(source)).toEqual([
      'trait OrderEvent',
      'class OrderCreated',
      'class OrderRepository',
      'function find',
      'function query',
      'function toString',
      'object Cancelled',
      'object OrderService',
    ]);
  });

  test('runs the JVM messaging extractor', () => {
    const source = `val record = new ProducerRecord[String, String]("orders", order.id, json)
val stub = InventoryServiceGrpc.stub(channel)
`;
    const routes = (scalaPack.routeExtractors ?? []).flatMap((extract) => extract(source));
    expect(routes.map((route) => `${route.kind} ${route.role} ${route.pattern}`)).toEqual([
      'topic producer orders',
      'grpc caller InventoryService/*',
    ]);
  });
});
