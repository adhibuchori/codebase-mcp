/**
 * Parses Go goroutine dumps: the output of a panic or fatal error, and of runtime/debug.Stack().
 * Each frame is a function line followed by an indented `file.go:123 +0x1d` line; Go prints the
 * innermost call first already. The message is the panic line(s), or else the error line logged
 * just before the first goroutine header.
 */
import type { StackFrame } from '../../core/model/domain.types.ts';
import type { StackParser } from '../../core/model/language-pack.types.ts';

const GOROUTINE = /^\s*goroutine \d+ \[[^\]]*\]:\s*$/;
const LOCATION = /^\s+(?!at\s)(\S.*?):(\d+)(?:\s+\+0x[0-9a-fA-F]+)?\s*$/;
const PANIC = /^\s*(?:panic|fatal error): /;
const CREATED_BY = /^created by (\S+)/;

/** The function a frame's first line names, without its argument values; "" when it names none. */
function functionOf(line: string): string {
  const created = CREATED_BY.exec(line);
  if (created) return created[1] ?? '';
  const open = line.lastIndexOf('(');
  return line.endsWith(')') && open > 0 && !line.startsWith('at ') ? line.slice(0, open) : '';
}

function frameAt(header: string, next: string): StackFrame | null {
  const location = LOCATION.exec(next);
  const func = location ? functionOf(header.trim()) : '';
  if (!location || !func) return null;
  const file = location[1] ?? '';
  return {
    raw: `${header.trim()}\n${next.trim()}`,
    file,
    line: Number(location[2]),
    func,
    pathHint: file.replaceAll('\\', '/'),
  };
}

function messagesOf(lines: readonly string[]): string[] {
  const panics = lines.filter((line) => PANIC.test(line)).map((line) => line.trim());
  if (panics.length > 0) return panics;
  const first = lines.findIndex((line) => GOROUTINE.test(line));
  const logged = lines
    .slice(0, Math.max(0, first))
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('[signal'));
  return logged.slice(-1);
}

export const goStackParser: StackParser = (text) => {
  const lines = text.split(/\r?\n/);
  const frames = lines.flatMap((line, i) => frameAt(line, lines[i + 1] ?? '') ?? []);
  if (frames.length === 0) return null;
  return { runtime: 'go', messages: messagesOf(lines), frames };
};
