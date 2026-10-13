/**
 * How every git command runs. Hardened after the reference git MCP server's CVEs and git's own
 * advisories: no system or global config (a repo cannot point git at a helper through them),
 * fsmonitor off (it runs a program on status), no pager, no prompts, no optional locks, literal
 * pathspecs, and no shell. Callers add --end-of-options before any user value.
 */
import { spawnCollect, type SpawnResult } from '../process/spawn-collect.ts';

export interface GitContext {
  /** Allow-listed environment (PATH, HOME, …) from src/env.ts. */
  readonly baseEnv: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
}

/**
 * "No global config" as git understands it everywhere. Git for Windows maps the literal "/dev/null"
 * to NUL itself, while os.devNull there ("\\.\nul") makes every git command fail with "unable to
 * access '\\.\nul': Invalid argument".
 */
const NO_CONFIG_FILE = '/dev/null';

const GLOBAL_ARGS = [
  '-c',
  'core.fsmonitor=false',
  '-c',
  'core.untrackedCache=false',
  '-c',
  'core.quotePath=false',
  '-c',
  'diff.external=',
  '--no-pager',
  '--literal-pathspecs',
];

function gitEnv(baseEnv: Readonly<Record<string, string>>): Record<string, string> {
  return {
    ...baseEnv,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: NO_CONFIG_FILE,
    GIT_TERMINAL_PROMPT: '0',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_PAGER: 'cat',
    LC_ALL: 'C',
  };
}

export interface GitCall {
  readonly cwd: string;
  readonly args: readonly string[];
  readonly maxBytes?: number;
}

export function runGit(context: GitContext, call: GitCall): Promise<SpawnResult> {
  return spawnCollect('git', [...GLOBAL_ARGS, ...call.args], {
    cwd: call.cwd,
    env: gitEnv(context.baseEnv),
    maxBytes: call.maxBytes ?? 2 * 1024 * 1024,
    timeoutMs: context.timeoutMs,
  });
}

/** The first line of git's error output, for a ToolError the model can read. */
export function gitError(result: SpawnResult): string {
  if (result.timedOut) return 'git took too long and was stopped.';
  const line = result.stderr.split('\n').find((text) => text.trim()) ?? 'unknown error';
  return `git failed: ${line.replace(/^(fatal|error):\s*/, '').trim()}`;
}
