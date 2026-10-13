import { expect, test } from 'bun:test';
import { loadSqlite } from '../sqlite.ts';

test('closing really closes: no cached statement keeps the connection, or its file, alive', async () => {
  const open = await loadSqlite();
  const db = open(':memory:', { readonly: false });
  expect(db.get('SELECT 1 AS one')).toEqual({ one: 1 });
  db.close();
  /* A zombie connection (bun:sqlite with a live statement) would still answer here. */
  expect(() => db.get('SELECT 1 AS one')).toThrow();
});
