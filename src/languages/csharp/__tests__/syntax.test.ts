/** Tests for the C# source helpers: masking, brackets, first arguments and literal values. */
import { describe, expect, test } from 'bun:test';
import { braceDelta, closingBracket, firstArgument, maskSource, valuesOf } from '../syntax.ts';

describe('maskSource', () => {
  const csharp = [
    'var path = @"C:\\orders\\[id]"; // [HttpGet("old")]',
    'var url = $"api/orders/{id}"; var raw = """',
    '  { "status": "open" }',
    '  """; char c = \'{\';',
    '/* app.MapGet("/disabled", h); */ var quote = @"say ""hi""";',
  ].join('\n');

  test('blanks comments in both copies and keeps every offset and newline', () => {
    const { code, bare } = maskSource(csharp);
    expect(code).toHaveLength(csharp.length);
    expect(bare.split('\n')).toHaveLength(5);
    expect(code).not.toContain('HttpGet');
    expect(code).not.toContain('/disabled');
    expect(code).toContain('$"api/orders/{id}"');
  });

  test('blanks verbatim, interpolated and raw strings and chars in the bare copy', () => {
    const { bare } = maskSource(csharp);
    expect(bare).not.toContain('[id]');
    expect(bare).not.toContain('{id}');
    expect(bare).not.toContain('status');
    expect(bare).not.toContain('hi');
    expect(bare.split('\n').map(braceDelta)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('closingBracket and firstArgument', () => {
  test('finds the bracket closing an attribute section on a bare line', () => {
    const line = maskSource('[Route("api/[controller]")] [ApiController]').bare;
    expect(closingBracket(line, 0)).toBe(26);
    expect(closingBracket(line, 1)).toBe(-1);
    expect(closingBracket('[Route(', 0)).toBe(-1);
  });

  test('reads the first top-level argument of a call as written', () => {
    const text =
      'producer.Produce(new TopicPartition("orders", new Partition(0)), message, handler);';
    expect(firstArgument(maskSource(text), text.indexOf('('))).toBe(
      'new TopicPartition("orders", new Partition(0))',
    );
    const single = 'consumer.Subscribe(new[] { "a", "b" });';
    expect(firstArgument(maskSource(single), single.indexOf('('))).toBe('new[] { "a", "b" }');
    expect(firstArgument(maskSource('consumer.Subscribe("orders"'), 18)).toBe('');
  });

  test('gives the literals of an expression, or the expression itself', () => {
    expect(valuesOf('new[] { "payments", "refunds" }')).toEqual(['payments', 'refunds']);
    expect(valuesOf('_options.Topic')).toEqual(['_options.Topic']);
    expect(valuesOf('')).toEqual([]);
  });
});
