/**
 * Opaque continuation handles. A cursor carries the next offset and a key of the request it belongs
 * to, so it cannot be replayed against a different query. The server stays stateless: the next page is
 * computed again from the same request.
 */
import { ToolError } from '../errors/tool-error.ts';

/** FNV-1a over the JSON of the request parts: stable across runs and runtimes. */
export function requestKey(parts: readonly unknown[]): string {
  let hash = 0x811c9dc5;
  for (const char of JSON.stringify(parts)) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

export function encodeCursor(offset: number, key: string): string {
  return Buffer.from(`${offset}.${key}`, 'utf8').toString('base64url');
}

/** The offset a cursor points at, 0 without one. A malformed or foreign cursor is a ToolError. */
export function decodeCursor(cursor: string | undefined, key: string): number {
  if (!cursor) return 0;
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  const match = /^(\d+)\.([0-9a-z]+)$/.exec(decoded);
  if (!match || match[2] !== key) {
    throw new ToolError(
      'This cursor belongs to a different request.',
      'Repeat the exact same arguments with the cursor, or drop the cursor to start over.',
    );
  }
  return Number(match[1]);
}
