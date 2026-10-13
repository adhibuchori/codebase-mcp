import { expect, test } from 'bun:test';
import { scorePath } from '../path-score.ts';

test('every word must appear in the path', () => {
  expect(scorePath('src/api/OrderController.java', 'order controller')).toBeGreaterThan(0);
  expect(scorePath('src/api/OrderController.java', 'order payment')).toBe(0);
  expect(scorePath('src/a.ts', '  ')).toBe(0);
});

test('a file-name hit beats a folder hit, and shallow beats deep', () => {
  const inName = scorePath('src/OrderService.java', 'order');
  const inFolder = scorePath('src/order/Service.java', 'order');
  expect(inName).toBeGreaterThan(inFolder);
  expect(scorePath('a/Order.java', 'order')).toBeGreaterThan(
    scorePath('a/b/c/d/e/f/g/Order.java', 'order'),
  );
});

test('a single word falls back to a subsequence of the file name', () => {
  expect(scorePath('src/api/OrderController.java', 'ordctl')).toBe(5);
  expect(scorePath('src/api/OrderController.java', 'xyz')).toBe(0);
});
