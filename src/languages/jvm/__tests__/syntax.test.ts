/** Tests for the JVM source helpers: masking, argument lists and annotation reading. */
import { describe, expect, test } from 'bun:test';
import {
  annotationsIn,
  argumentsAt,
  attributeValues,
  maskSource,
  splitArguments,
  valuesOf,
} from '../syntax.ts';

describe('maskSource', () => {
  const java = [
    'String url = "http://orders/api"; // GET /old',
    '/* @GetMapping("/disabled") */ char quote = \'"\';',
    'String sql = """',
    '    SELECT * FROM orders WHERE id = {id}',
    '    """;',
  ].join('\n');

  test('blanks comments in both copies and keeps every offset and newline', () => {
    const { code, bare } = maskSource(java);
    expect(code).toHaveLength(java.length);
    expect(bare).toHaveLength(java.length);
    expect(code.split('\n')).toHaveLength(5);
    expect(code).not.toContain('GET /old');
    expect(code).not.toContain('@GetMapping');
    expect(code).toContain('"http://orders/api"');
  });

  test('blanks string, char and text-block literals in the bare copy only', () => {
    const { code, bare } = maskSource(java);
    expect(code).toContain("'\"'");
    expect(code).toContain('{id}');
    expect(bare).not.toContain('orders');
    expect(bare).not.toContain('{id}');
    expect(bare).toContain('String url =');
  });

  test('pairs each bracket with its closer, ignoring brackets inside literals', () => {
    const text = 'call(a, "(", b[0], { x })';
    const source = maskSource(text);
    expect(source.closers.get(4)).toBe(text.length - 1);
    expect(source.closers.get(text.indexOf('['))).toBe(text.indexOf(']'));
    expect(source.closers.get(text.indexOf('{'))).toBe(text.indexOf('}'));
  });
});

describe('argumentsAt and splitArguments', () => {
  test('reads named and positional arguments, keeping array values whole', () => {
    const text = '@RequestMapping(value = {"/a", "/b"}, method = RequestMethod.GET, "x")';
    const source = maskSource(text);
    const args = argumentsAt(source, text.indexOf('('));
    expect(args?.end).toBe(text.length);
    expect(args ? splitArguments(args) : []).toEqual([
      { name: 'value', value: ' {"/a", "/b"}' },
      { name: 'method', value: ' RequestMethod.GET' },
      { name: '', value: ' "x"' },
    ]);
  });

  test('a comma or an equals sign inside a literal does not split an argument', () => {
    const text = '@KafkaListener(topics = "a,b", condition = "x == y")';
    const source = maskSource(text);
    const args = argumentsAt(source, text.indexOf('('));
    expect(args ? splitArguments(args).map((arg) => arg.name) : []).toEqual([
      'topics',
      'condition',
    ]);
  });

  test('returns null for a parenthesis that never closes, and no arguments for "()"', () => {
    const open = maskSource('@GetMapping("/x"');
    expect(argumentsAt(open, 11)).toBeNull();
    const empty = maskSource('@GetMapping()');
    const args = argumentsAt(empty, 11);
    expect(args ? splitArguments(args) : null).toEqual([]);
  });
});

describe('valuesOf and attributeValues', () => {
  test('gives the literals of a value, unescaped, or the expression without literals', () => {
    expect(valuesOf(' {"/a", "/b"}')).toEqual(['/a', '/b']);
    expect(valuesOf(' "\\${app.topics.orders}"')).toEqual(['${app.topics.orders}']);
    expect(valuesOf(' Topics.ORDERS ')).toEqual(['Topics.ORDERS']);
    expect(valuesOf('  ')).toEqual([]);
  });

  test('takes the first attribute that is set, with positional arguments standing for value', () => {
    const args = [
      { name: '', value: '"/orders"' },
      { name: 'path', value: '"/ignored"' },
    ];
    expect(attributeValues(args, ['value', 'path'])).toEqual(['/orders']);
    expect(attributeValues(args, ['path', 'value'])).toEqual(['/ignored']);
    expect(attributeValues(args, ['topics'])).toEqual([]);
  });
});

describe('annotationsIn', () => {
  const kotlin = [
    '/** Uses @Deprecated("doc") in a comment. */',
    '@org.springframework.web.bind.annotation.RestController',
    '@RequestMapping ("/api")',
    'class Listener {',
    '    @KafkaListener(topicPartitions = [TopicPartition(topic = "x")], id = "@Inner")',
    '    @field:JsonProperty("id") val id: String = "a@b.c"',
    '}',
  ].join('\n');

  test('finds annotations outside comments and literals, with simple names and lines', () => {
    const found = annotationsIn(maskSource(kotlin));
    expect(found.map((a) => [a.name, a.line])).toEqual([
      ['RestController', 2],
      ['RequestMapping', 3],
      ['KafkaListener', 5],
      ['field', 6],
    ]);
  });

  test('reads arguments, also after a space, and skips annotations nested inside them', () => {
    const [, mapping, listener] = annotationsIn(maskSource(kotlin));
    expect(mapping?.args).toEqual([{ name: '', value: '"/api"' }]);
    expect(listener?.text).toContain('TopicPartition(topic = "x")');
    expect(listener?.args.map((arg) => arg.name)).toEqual(['topicPartitions', 'id']);
  });

  test('an annotation without arguments ends right after its name', () => {
    const [annotation] = annotationsIn(maskSource('@Override public String toString()'));
    expect(annotation).toEqual({ name: 'Override', line: 1, start: 0, end: 9, text: '', args: [] });
  });
});
