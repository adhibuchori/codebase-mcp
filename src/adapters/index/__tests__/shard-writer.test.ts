import { expect, test } from 'bun:test';
import { transaction } from '../shard-writer.ts';

test('a failed write is rolled back and the error kept', () => {
  const statements: string[] = [];
  const db = { exec: (sql: string) => void statements.push(sql) };
  expect(() =>
    transaction(db, () => {
      throw new Error('disk full');
    }),
  ).toThrow('disk full');
  expect(statements).toEqual(['BEGIN IMMEDIATE', 'ROLLBACK']);
  transaction(db, () => {});
  expect(statements.slice(2)).toEqual(['BEGIN IMMEDIATE', 'COMMIT']);
});
