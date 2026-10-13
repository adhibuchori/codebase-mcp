/**
 * From a runtime log line or error message to the literal text the source code must contain.
 * Values that change per event (timestamps, ids, numbers, quoted values, URLs) are masked, and the
 * constant fragments between them are what log statements are found by (the Adyen log-to-code
 * approach, MSR 2019). Structured logs (JSON or logfmt) give their message field directly.
 */
const HOLE = '\u0000';

const MASKS: readonly RegExp[] = [
  /\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g,
  /\b\d{2}:\d{2}:\d{2}(?:[.,]\d+)?\b/g,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
  /\bhttps?:\/\/\S+/g,
  /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g,
  /\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g,
  /\b(?:0x)?[0-9a-f]{8,}\b/gi,
  /"[^"\n]*"|'[^'\n]*'|`[^`\n]*`/g,
  /[A-Za-z_-]*\d[\w-]*/g,
];

/**
 * The log prefix: an optional leading token, [tags], the level, Spring Boot's "<pid> ---", a
 * [thread], and the logger name, either "name:" / "name -" or a dotted "app.consumer" before a space.
 */
const PREFIX = new RegExp(
  [
    '^\\s*(?:[[(]?[^\\]\\s]*[\\])]?\\s+)??(?:\\[[^\\]]*\\]\\s*)*',
    '(?:TRACE|DEBUG|INFO|NOTICE|WARN|WARNING|ERROR|SEVERE|FATAL|CRITICAL)\\b[:\\s-]*',
    '(?:\\d+\\s+---\\s+)?(?:\\[[^\\]]*\\]\\s*)*',
    '(?:[\\w$.]+\\s*[:-]\\s+|[\\w$]+(?:\\.[\\w$]+)+\\s+)?',
  ].join(''),
  'i',
);

const EXCEPTION_PREFIX = /^(?:[\w$]+\.)*[\w$]*(?:Exception|Error|Panic)\s*:\s*/;

const MESSAGE_FIELDS = ['message', 'msg', 'error', 'err', 'exception'];

/** The message field of a JSON log line, or undefined when the line is not one. */
function jsonMessage(text: string): string | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof value !== 'object' || value === null) return undefined;
  const fields = new Map(Object.entries(value));
  const found = MESSAGE_FIELDS.map((key) => fields.get(key)).find((v) => typeof v === 'string');
  return typeof found === 'string' ? found : undefined;
}

/** The human message of a structured log line (JSON or logfmt), or the line itself. */
export function messageOf(line: string): string {
  const text = line.trim();
  const fromJson = text.startsWith('{') ? jsonMessage(text) : undefined;
  if (fromJson !== undefined) return fromJson;
  const logfmt = /(?:^|\s)msg="((?:[^"\\]|\\.)*)"/.exec(text);
  return logfmt?.[1] ?? text;
}

/** Strips the log prefix (timestamp, level, logger) and an exception class name. */
export function stripLogPrefix(message: string): string {
  const masked = MASKS.slice(0, 2).reduce((text, re) => text.replace(re, ''), message);
  return masked.replace(PREFIX, '').replace(EXCEPTION_PREFIX, '').trim();
}

/** Constant fragments of a message, longest first, each at least `min` characters with a letter. */
export function literalFragments(message: string, min = 4, max = 4): string[] {
  const masked = MASKS.reduce(
    (text, re) => text.replace(re, HOLE),
    stripLogPrefix(messageOf(message)),
  );
  const pieces = masked
    .split(HOLE)
    .map((piece) => piece.replace(/^[\s,;:=()[\]{}<>|.-]+|[\s,;:=([{<>|.-]+$/g, ''))
    .filter((piece) => piece.length >= min && /[A-Za-z]/.test(piece));
  return [...new Set(pieces)].toSorted((a, b) => b.length - a.length).slice(0, max);
}

/** Go-style wrapped errors ("fetch order: decode body: unexpected EOF"): one segment per call site. */
export function errorChain(message: string): string[] {
  const segments = stripLogPrefix(messageOf(message))
    .split(/:\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return segments.length >= 2 ? segments : [];
}
