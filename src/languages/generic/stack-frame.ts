/**
 * Frame building shared by the Node, Python, PHP and Ruby stack parsers, so every runtime's frames
 * are normalised the same way: `file` loses its file:// scheme, and `pathHint` also loses bundler
 * prefixes (webpack://app/) and uses forward slashes, ready for suffix matching against a repo.
 * A trace copied out of a JSON log line has its newlines escaped; it is unescaped first.
 */
import type { StackFrame } from '../../core/model/domain.types.ts';

export interface FrameParts {
  readonly raw: string;
  readonly file: string;
  readonly line: number;
  readonly func: string;
}

/** file:///app/x.mjs → /app/x.mjs, and file:///C:/app/x.mjs → C:/app/x.mjs. */
const FILE_URL = /^file:\/\/(?:\/(?=[A-Za-z]:))?/;
const BUNDLER_PREFIX = /^(?:webpack:\/\/[^/]*\/|webpack-internal:\/\/\/)/;
const JSON_ESCAPE = /\\(["\\nrt])/g;
const UNESCAPED: ReadonlyMap<string, string> = new Map([
  ['n', '\n'],
  ['r', ''],
  ['t', '\t'],
  ['"', '"'],
  ['\\', '\\'],
]);

export function stackFrame(parts: FrameParts): StackFrame {
  const file = parts.file.replace(FILE_URL, '');
  const pathHint = file.replace(BUNDLER_PREFIX, '').replaceAll('\\', '/');
  return { raw: parts.raw, file, line: parts.line, func: parts.func, pathHint };
}

/**
 * The trace with JSON escapes undone when `escapedFrame` finds a frame behind an escaped newline
 * (`\n    at fn (…)` inside a JSON string); any other text is returned unchanged, so a Windows path
 * such as C:\new\x.php in a plain trace is never mangled.
 */
export function unescapeTrace(text: string, escapedFrame: RegExp): string {
  if (!escapedFrame.test(text)) return text;
  return text.replace(JSON_ESCAPE, (escape, char: string) => UNESCAPED.get(char) ?? escape);
}
