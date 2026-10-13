/** Typed reads from SQLite rows, so no query result is ever asserted into a type. */
import type { SqlRow } from './sqlite.ts';

export function text(row: SqlRow | undefined, key: string): string {
  const value = row?.[key];
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean')
    return String(value);
  return value === null || value === undefined ? '' : JSON.stringify(value);
}

export function int(row: SqlRow | undefined, key: string): number {
  const value = row?.[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  return typeof value === 'string' && value !== '' ? Number(value) : 0;
}
