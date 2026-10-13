/** Tests for the Go pack: regex symbols, go.mod framework rules and log calls. */
import { describe, expect, test } from 'bun:test';
import { goPack } from '../pack.ts';

/** The first pattern that names each line, as the regex symbol fallback applies them. */
function symbolsOf(source: string): string[] {
  return source.split('\n').flatMap((line) => {
    for (const pattern of goPack.symbolPatterns ?? []) {
      const name = pattern.regex.exec(line)?.[1];
      if (name) return [`${pattern.kind} ${name}`];
    }
    return [];
  });
}

describe('goPack', () => {
  test('describes Go', () => {
    expect(goPack).toMatchObject({
      id: 'go',
      name: 'Go',
      tier: 1,
      extensions: ['.go'],
      grammar: 'go',
    });
  });

  test('finds functions, methods, structs, interfaces and other types', () => {
    const source = `package orders

type OrderService struct {
	repo Repository
}
type Repository interface {
	Find(ctx context.Context, id string) (*Order, error)
}
type Set[T comparable] struct{ items map[T]struct{} }
type Status string
func NewOrderService(repo Repository) *OrderService {
	return &OrderService{repo: repo}
}
func (s *OrderService) Cancel(ctx context.Context, id string) error {
	return nil
}
func Map[T, U any](items []T, f func(T) U) []U { return nil }
`;
    expect(symbolsOf(source)).toEqual([
      'struct OrderService',
      'interface Repository',
      'struct Set',
      'type Status',
      'function NewOrderService',
      'method Cancel',
      'function Map',
    ]);
  });

  test('detects frameworks in go.mod', () => {
    const goMod = `module github.com/acme/orders

go 1.22

require (
	github.com/IBM/sarama v1.43.2
	github.com/confluentinc/confluent-kafka-go/v2 v2.4.0
	github.com/gin-gonic/gin v1.10.0
	github.com/go-chi/chi/v5 v5.0.12
	github.com/gofiber/fiber/v2 v2.52.4
	github.com/gorilla/mux v1.8.1
	github.com/labstack/echo/v4 v4.12.0
	github.com/segmentio/kafka-go v0.4.47
	google.golang.org/grpc v1.64.0
)
`;
    const found = (goPack.frameworks ?? []).filter(
      (rule) => rule.file.test('services/orders/go.mod') && rule.contains.test(goMod),
    );
    expect(found.map((rule) => rule.name)).toEqual([
      'gin',
      'echo',
      'chi',
      'fiber',
      'gorilla-mux',
      'grpc',
      'kafka-go',
      'sarama',
      'confluent-kafka-go',
    ]);
    expect((goPack.frameworks ?? []).some((rule) => rule.file.test('go.sum'))).toBe(false);
  });

  test('recognises log, error and panic calls', () => {
    const calls = [
      'log.Printf("order %s not found", id)',
      's.logger.Error("cancel failed", zap.Error(err))',
      'slog.ErrorContext(ctx, "cancel failed", "order", id)',
      'log.Error().Err(err).Str("order", id).Msg("cancel failed")',
      'logrus.WithFields(logrus.Fields{"order": id}).Warnf("retrying %d", n)',
      'return fmt.Errorf("cancel order %s: %w", id, err)',
      'return errors.New("order is closed")',
      'return errors.Wrapf(err, "load order %s", id)',
      'panic("unreachable")',
    ];
    expect(calls.filter((line) => goPack.logCall?.test(line))).toEqual(calls);
    expect(goPack.logCall?.test('total := order.Total()')).toBe(false);
  });
});
