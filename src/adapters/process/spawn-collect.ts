/**
 * Runs a program without a shell (arguments are passed as an array, never parsed), collects stdout
 * up to a byte limit and stops the program when the limit, the deadline or the line callback says
 * so. ripgrep and git both run through here.
 */
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';

export interface SpawnOptions {
  readonly cwd: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly maxBytes: number;
  readonly timeoutMs: number;
  /** Called with each complete stdout line; returning false stops the program early. */
  readonly onLine?: (line: string) => boolean;
}

export interface SpawnResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly truncated: boolean;
  readonly timedOut: boolean;
  /** True when the program was stopped by the line callback. */
  readonly stopped: boolean;
}

interface Collector {
  stdout: string;
  stderr: string;
  pending: string;
  truncated: boolean;
  timedOut: boolean;
  stopped: boolean;
}

interface Job {
  readonly command: string;
  readonly args: readonly string[];
  readonly options: SpawnOptions;
}

type Child = ChildProcessByStdio<null, Readable, Readable>;

/** Appends a chunk; false means the program should stop (limit reached or callback said stop). */
function feed(state: Collector, chunk: string, options: SpawnOptions): boolean {
  const room = options.maxBytes - state.stdout.length;
  if (chunk.length > room) state.truncated = true;
  const kept = chunk.slice(0, Math.max(0, room));
  state.stdout += kept;
  if (!options.onLine) return !state.truncated;
  const lines = (state.pending + kept).split('\n');
  state.pending = lines.pop() ?? '';
  if (!lines.every((line) => options.onLine?.(line) !== false)) state.stopped = true;
  return !state.stopped && !state.truncated;
}

function listen(child: Child, state: Collector, options: SpawnOptions): void {
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    if (!feed(state, chunk, options)) child.kill();
  });
  child.stderr.on('data', (chunk: string) => {
    if (state.stderr.length < 4096) state.stderr += chunk;
  });
}

function collect(job: Job, resolve: (result: SpawnResult) => void): void {
  const state: Collector = {
    stdout: '',
    stderr: '',
    pending: '',
    truncated: false,
    timedOut: false,
    stopped: false,
  };
  const child: Child = spawn(job.command, [...job.args], {
    cwd: job.options.cwd,
    ...(job.options.env ? { env: { ...job.options.env } } : {}),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const timer = setTimeout(() => {
    state.timedOut = true;
    child.kill();
  }, job.options.timeoutMs);
  listen(child, state, job.options);
  const finish = (code: number | null): void => {
    clearTimeout(timer);
    if (state.pending && !state.stopped) job.options.onLine?.(state.pending);
    const { stdout, stderr, truncated, timedOut, stopped } = state;
    resolve({ code, stdout, stderr, truncated, timedOut, stopped });
  };
  child.on('error', (error) => {
    state.stderr += error.message;
    finish(null);
  });
  child.on('close', finish);
}

export function spawnCollect(
  command: string,
  args: readonly string[],
  options: SpawnOptions,
): Promise<SpawnResult> {
  return new Promise((resolve) => collect({ command, args, options }, resolve));
}
