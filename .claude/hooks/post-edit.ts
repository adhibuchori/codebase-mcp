#!/usr/bin/env bun
/**
 * PostToolUse hook for Write, Edit and MultiEdit: formats the file Claude just wrote with oxfmt,
 * then lints it (oxlint, type-aware) and checks its comment style, and hands any finding back as
 * additionalContext. A clean file says nothing. One script, because hooks on one event run in
 * parallel and a separate lint hook would race the formatter.
 *
 * Feedback only: it fails open. A missing tool, an unreadable payload, a tool that fails or runs
 * past its time cap means no note and exit 0. Files whose name starts with .env are never touched.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, sep } from 'node:path';

const ROOT = process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd();
const FORMAT = /\.(ts|mts|cts|js|mjs|cjs|json|md)$/;
const LINT = /\.(ts|mts|cts|js|mjs|cjs)$/;

function payloadPath(): string {
  try {
    const payload: unknown = JSON.parse(readFileSync(0, 'utf8'));
    const input =
      typeof payload === 'object' && payload !== null
        ? Reflect.get(payload, 'tool_input')
        : undefined;
    const path =
      typeof input === 'object' && input !== null ? Reflect.get(input, 'file_path') : undefined;
    return typeof path === 'string' ? path : '';
  } catch {
    return '';
  }
}

/** Runs a project tool from node_modules/.bin; its output, or '' when it is missing or times out. */
function run(
  tool: string,
  args: readonly string[],
  timeoutMs: number,
): { ok: boolean; output: string } {
  const bin = join(
    ROOT,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? `${tool}.cmd` : tool,
  );
  if (!existsSync(bin)) return { ok: true, output: '' };
  const result = spawnSync(bin, args, { cwd: ROOT, encoding: 'utf8', timeout: timeoutMs });
  if (result.error) return { ok: true, output: '' };
  return { ok: result.status === 0, output: `${result.stdout}${result.stderr}`.trim() };
}

function findings(rel: string): string[] {
  const notes: string[] = [];
  if (FORMAT.test(rel)) run('oxfmt', ['--write', '--', rel], 10_000);
  if (!LINT.test(rel)) return notes;
  const lint = run('oxlint', ['--type-aware', '--deny-warnings', '--', rel], 30_000);
  if (!lint.ok && lint.output)
    notes.push(
      `oxlint found problems in ${rel}:\n${lint.output.split('\n').slice(0, 40).join('\n')}`,
    );
  const comments = spawnSync('node', [join(ROOT, 'scripts/check/comment-style.mjs'), rel], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 10_000,
  });
  if (comments.status === 1)
    notes.push(
      `${rel} has // comments; this repo uses /** */ or /* */ only:\n${comments.stdout.trim()}`,
    );
  return notes;
}

function main(): void {
  const file = payloadPath();
  if (!file) return;
  const rel = relative(ROOT, isAbsolute(file) ? file : join(ROOT, file));
  if (
    rel.startsWith('..') ||
    isAbsolute(rel) ||
    basename(rel).startsWith('.env') ||
    !existsSync(join(ROOT, rel))
  )
    return;
  const notes = findings(rel.split(sep).join('/'));
  if (notes.length === 0) return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: notes.join('\n\n') },
    }),
  );
}

try {
  main();
} catch {
  /* Feedback only: never fail the tool call that already happened. */
}
