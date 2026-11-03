import { expect, test } from 'bun:test';
import { bareType, captureMap, lastSegment, plainReceiver } from '../type-text.ts';

test('bare types drop generics, arrays, nullability, annotations and readonly', () => {
  expect(bareType('List<Order>')).toBe('List');
  expect(bareType('@NonNull Order[]')).toBe('Order');
  expect(bareType('PaymentsApi | null')).toBe('PaymentsApi');
  expect(bareType('undefined | Api')).toBe('Api');
  expect(bareType('PaymentsApi?')).toBe('PaymentsApi');
  expect(bareType('readonly Item[]')).toBe('Item');
  expect(bareType('com.acme.Foo<T>')).toBe('com.acme.Foo');
  expect(bareType('var')).toBe('');
  expect(bareType('(x: number) => void')).toBe('');
  expect(bareType('some View')).toBe('');
});

test('segments, receivers and captures', () => {
  expect(lastSegment('com.acme.Foo')).toBe('Foo');
  expect(lastSegment('Foo')).toBe('Foo');
  expect(plainReceiver('this . api')).toBe('this.api');
  expect(plainReceiver('lookup()')).toBe('');
  const map = captureMap([
    { name: 'call.name', text: 'a', line: 1 },
    { name: 'call.name', text: 'b', line: 2 },
  ]);
  expect(map.get('call.name')?.text).toBe('a');
});
