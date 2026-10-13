/** Tests for the Go source helpers: masking, brace depth and value resolution. */
import { describe, expect, test } from 'bun:test';
import { braceDelta, goValue, maskSource } from '../syntax.ts';

describe('maskSource', () => {
  const go = [
    'const query = `',
    'SELECT * FROM orders WHERE payload @> \'{"status": "open"}\' -- {',
    '`',
    'r.GET("/orders/{id}", h) // r.GET("/old", h)',
    "var brace = '{' /* } */",
  ].join('\n');

  test('blanks comments in both copies and literals in the bare copy, keeping offsets', () => {
    const { code, bare } = maskSource(go);
    expect(code).toHaveLength(go.length);
    expect(bare.split('\n')).toHaveLength(5);
    expect(code).not.toContain('/old');
    expect(code).toContain('"/orders/{id}"');
    expect(bare).not.toContain('SELECT');
    expect(bare).not.toContain('{id}');
  });

  test('leaves only code braces for the depth count', () => {
    const lines = maskSource(go).bare.split('\n');
    expect(lines.map(braceDelta)).toEqual([0, 0, 0, 0, 0]);
    expect(braceDelta('r.Route("/x", func(r chi.Router) {')).toBe(1);
    expect(braceDelta('})')).toBe(-1);
  });

  test('pairs each bracket with its closer', () => {
    const text = 'kafka.Writer{Topic: "a}", Balancer: &kafka.Hash{}}';
    const source = maskSource(text);
    expect(source.closers.get(text.indexOf('{'))).toBe(text.length - 1);
  });
});

describe('goValue', () => {
  const code = `const ordersTopic = "orders.created"
var auditTopic string = "audit"
func run() {
	topic := "notifications"
}`;

  test('gives literals, and resolves identifiers the file assigns a literal to', () => {
    expect(goValue(code, ' "payments" ')).toBe('payments');
    expect(goValue(code, 'ordersTopic')).toBe('orders.created');
    expect(goValue(code, 'auditTopic')).toBe('audit');
    expect(goValue(code, '&topic')).toBe('notifications');
  });

  test('keeps unresolved identifiers and selectors as written', () => {
    expect(goValue(code, 'cfg.Kafka.Topic')).toBe('cfg.Kafka.Topic');
    expect(goValue(code, 'topicName')).toBe('topicName');
  });
});
