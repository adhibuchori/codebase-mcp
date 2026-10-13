import { expect, test } from 'bun:test';
import { int, text } from '../rows.ts';

test('rows read strings, numbers and odd values safely', () => {
  expect(text({ a: 'x', b: 3, c: 4n, d: true, e: null, f: { g: 1 } }, 'a')).toBe('x');
  expect(text({ b: 3 }, 'b')).toBe('3');
  expect(text({ c: 4n }, 'c')).toBe('4');
  expect(text({ d: true }, 'd')).toBe('true');
  expect(text({ e: null }, 'e')).toBe('');
  expect(text({ f: { g: 1 } }, 'f')).toBe('{"g":1}');
  expect(text(undefined, 'x')).toBe('');
  expect(int({ a: 2, b: 3n, c: '4', d: '', e: null }, 'a')).toBe(2);
  expect(int({ b: 3n }, 'b')).toBe(3);
  expect(int({ c: '4' }, 'c')).toBe(4);
  expect(int({ d: '' }, 'd')).toBe(0);
  expect(int(undefined, 'x')).toBe(0);
});
