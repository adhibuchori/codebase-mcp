/**
 * Parses .NET exception output (Exception.ToString(), unhandled-exception and ASP.NET Core logs).
 * .NET prints each inner exception's frames before the outer ones, separated by "--- End of inner
 * exception stack trace ---", so the printed order is already root cause first. Frames without
 * " in <file>:line N" (no PDB, framework code) keep an empty file. JVM frames are not .NET frames.
 */
import type { StackFrame } from '../../core/model/domain.types.ts';
import type { StackParser } from '../../core/model/language-pack.types.ts';

const FRAME = /^\s*at ([^\s(]+)\(([^)]*)\)(?: in (.+):line (\d+))?/;
const JVM_LOCATION =
  /^(?:[^\s:()]+\.(?:java|kt|kts|scala|groovy|clj)(?::\d+)?|Native Method|Unknown Source|<generated>)$/;
const HEADER = /^\s*(?:Unhandled exception\.\s*)?((?:[\w`]+\.)+[\w`]*Exception\b.*)$/;
const INNER = /^\s*---> (?:\(Inner Exception #\d+\) )?(.+)$/;

function frameOf(line: string): StackFrame | null {
  const match = FRAME.exec(line);
  if (!match || JVM_LOCATION.test(match[2] ?? '')) return null;
  const file = match[3] ?? '';
  return {
    raw: line.trim(),
    file,
    line: Number(match[4] ?? 0),
    func: match[1] ?? '',
    pathHint: file.replaceAll('\\', '/'),
  };
}

/** The exception line, or an inner exception's after its "--->" marker. */
function messageOf(line: string): string {
  return (INNER.exec(line) ?? HEADER.exec(line))?.[1]?.trim() ?? '';
}

export const dotnetStackParser: StackParser = (text) => {
  const frames: StackFrame[] = [];
  const messages: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const frame = frameOf(line);
    const message = frame ? '' : messageOf(line);
    if (frame) frames.push(frame);
    else if (message) messages.push(message);
  }
  return frames.length === 0 ? null : { runtime: 'dotnet', messages, frames };
};
