/**
 * Code references, the one identifier every tool prints and accepts:
 *   repo/path            a file
 *   repo/path:120        a line (read_code shows the lines around it)
 *   repo/path:120-180    a range
 *   repo/path#Name       a symbol (Class.method works too)
 */
import { ToolError } from '../errors/tool-error.ts';

export interface CodeRef {
  readonly repo: string;
  readonly path: string;
  readonly line?: number;
  readonly endLine?: number;
  readonly symbol?: string;
}

const LINE_SUFFIX = /:(\d+)(?:-(\d+))?$/;

export function parseRef(input: string): CodeRef {
  const text = input.trim().replaceAll('\\', '/');
  const hash = text.indexOf('#');
  const target = hash >= 0 ? text.slice(0, hash) : text;
  const symbol = hash >= 0 ? text.slice(hash + 1).trim() : '';
  const lines = LINE_SUFFIX.exec(target);
  const location = lines ? target.slice(0, lines.index) : target;
  const slash = location.indexOf('/');
  if (slash <= 0 || slash === location.length - 1) {
    throw new ToolError(
      `"${input}" is not a code reference.`,
      'Use repo/path, repo/path:120, repo/path:120-180 or repo/path#Symbol, e.g. orders/src/App.java:42.',
    );
  }
  return {
    repo: location.slice(0, slash),
    path: location.slice(slash + 1),
    ...(lines ? { line: Number(lines[1]) } : {}),
    ...(lines?.[2] ? { endLine: Number(lines[2]) } : {}),
    ...(symbol ? { symbol } : {}),
  };
}

export function formatRef(repo: string, path: string, line?: number): string {
  return line === undefined ? `${repo}/${path}` : `${repo}/${path}:${line}`;
}
