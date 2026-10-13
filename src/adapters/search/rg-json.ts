/**
 * Parses ripgrep's --json output. Only "match" messages matter; offsets are bytes, so the column is
 * converted to characters for lines that are not plain ASCII.
 */
export interface RgMatch {
  readonly path: string;
  readonly line: number;
  readonly column: number;
  readonly text: string;
}

function get(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? new Map(Object.entries(value)).get(key)
    : undefined;
}

function text(value: unknown): string | undefined {
  const inner = get(value, 'text');
  return typeof inner === 'string' ? inner : undefined;
}

/** 1-based character column of a byte offset in a line. */
export function byteToColumn(line: string, byteOffset: number): number {
  if (Buffer.byteLength(line, 'utf8') === line.length) return byteOffset + 1;
  return Buffer.from(line, 'utf8').subarray(0, byteOffset).toString('utf8').length + 1;
}

export function parseRgLine(raw: string): RgMatch | null {
  let message: unknown;
  try {
    message = JSON.parse(raw);
  } catch {
    return null;
  }
  if (get(message, 'type') !== 'match') return null;
  const data = get(message, 'data');
  const path = text(get(data, 'path'));
  const lineText = text(get(data, 'lines'));
  const lineNumber = get(data, 'line_number');
  if (path === undefined || lineText === undefined || typeof lineNumber !== 'number') return null;
  const submatches = get(data, 'submatches');
  const first: unknown = Array.isArray(submatches) ? submatches[0] : undefined;
  const start = get(first, 'start');
  const line = lineText.replace(/\r?\n$/, '');
  return {
    path: path.replaceAll('\\', '/').replace(/^\.\//, ''),
    line: lineNumber,
    column: byteToColumn(line, typeof start === 'number' ? start : 0),
    text: line,
  };
}
