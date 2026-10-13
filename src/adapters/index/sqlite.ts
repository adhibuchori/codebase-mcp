/**
 * SQLite on whichever engine the runtime ships: bun:sqlite on Bun, node:sqlite on Node 22.13+.
 * Both bundle FTS5 with the trigram tokenizer and contentless_delete. Statements are cached per
 * connection. This is a raw runtime client: only one branch runs under a given runtime.
 */
type SqlValue = string | number | null;
export type SqlRow = Readonly<Record<string, unknown>>;

export interface SqlDb {
  exec(sql: string): void;
  all(sql: string, params?: readonly SqlValue[]): SqlRow[];
  get(sql: string, params?: readonly SqlValue[]): SqlRow | undefined;
  run(sql: string, params?: readonly SqlValue[]): void;
  close(): void;
}

export type OpenSqlite = (path: string, options: { readonly: boolean }) => SqlDb;

async function bunEngine(): Promise<OpenSqlite> {
  const { Database } = await import('bun:sqlite');
  return (path, options) => {
    const db = new Database(path, options.readonly ? { readonly: true } : { create: true });
    const cache = new Map<string, ReturnType<typeof db.prepare<SqlRow, SqlValue[]>>>();
    const statement = (sql: string) => {
      const cached = cache.get(sql);
      if (cached) return cached;
      const prepared = db.prepare<SqlRow, SqlValue[]>(sql);
      cache.set(sql, prepared);
      return prepared;
    };
    return {
      exec: (sql) => db.run(sql),
      all: (sql, params = []) => statement(sql).all(...params),
      get: (sql, params = []) => statement(sql).get(...params) ?? undefined,
      run: (sql, params = []) => void statement(sql).run(...params),
      close: () => {
        /*
         * bun:sqlite closes with sqlite3_close_v2: while a prepared statement lives, the connection
         * stays open as a zombie and keeps the file. Windows then refuses to delete or replace it.
         */
        for (const prepared of cache.values()) prepared.finalize();
        cache.clear();
        db.close();
      },
    };
  };
}

async function nodeEngine(): Promise<OpenSqlite> {
  const { DatabaseSync } = await import('node:sqlite');
  return (path, options) => {
    const db = new DatabaseSync(path, { readOnly: options.readonly });
    const cache = new Map<string, ReturnType<typeof db.prepare>>();
    const statement = (sql: string) => {
      const cached = cache.get(sql);
      if (cached) return cached;
      const prepared = db.prepare(sql);
      cache.set(sql, prepared);
      return prepared;
    };
    return {
      exec: (sql) => db.exec(sql),
      all: (sql, params = []) => statement(sql).all(...params),
      get: (sql, params = []) => statement(sql).get(...params),
      run: (sql, params = []) => void statement(sql).run(...params),
      /* node:sqlite finalizes every statement of the connection when it closes. */
      close: () => db.close(),
    };
  };
}

/** Loads the engine once; the returned opener is synchronous. */
export function loadSqlite(): Promise<OpenSqlite> {
  return typeof Bun === 'undefined' ? nodeEngine() : bunEngine();
}
