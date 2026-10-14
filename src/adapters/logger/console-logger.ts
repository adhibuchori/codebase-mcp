/**
 * Logger port on stderr: one line per event, "[time] LEVEL message key=value". stderr keeps stdout
 * free for the MCP stdio transport, and the terminal of `bun start` shows both. It writes to the
 * stream directly: Bun paints everything passed to console.error red, which made every INFO line
 * look like an error.
 */
import type { LogFields, Logger } from '../../ports/runtime.ts';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Readonly<Record<LogLevel, number>> = { debug: 10, info: 20, warn: 30, error: 40 };

export function isLogLevel(value: string): value is LogLevel {
  return value === 'debug' || value === 'info' || value === 'warn' || value === 'error';
}

function render(fields: LogFields | undefined): string {
  if (!fields) return '';
  const parts = Object.entries(fields).map(([key, value]) => {
    const text = String(value);
    return `${key}=${/[\s"=]/.test(text) ? JSON.stringify(text) : text}`;
  });
  return parts.length > 0 ? ` ${parts.join(' ')}` : '';
}

export function createConsoleLogger(
  level: LogLevel,
  write: (line: string) => void = (line) => process.stderr.write(`${line}\n`),
): Logger {
  const emit = (at: LogLevel, message: string, fields?: LogFields): void => {
    if (ORDER[at] < ORDER[level]) return;
    write(`[${new Date().toISOString()}] ${at.toUpperCase()} ${message}${render(fields)}`);
  };
  return {
    debug: (message, fields) => emit('debug', message, fields),
    info: (message, fields) => emit('info', message, fields),
    warn: (message, fields) => emit('warn', message, fields),
    error: (message, fields) => emit('error', message, fields),
  };
}
