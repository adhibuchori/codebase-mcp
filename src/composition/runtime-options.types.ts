/** What the composition root needs to assemble a runtime: plain values, no I/O. */
import type { LogLevel } from '../adapters/logger/console-logger.ts';

export interface RuntimeOptions {
  /** The project folder: holds assets/ and, by default, .cache/index. */
  readonly projectDir: string;
  readonly configPath: string;
  readonly reposEnv: string;
  readonly extraBlockedEnv: string;
  /** The ALLOW_BRANCH_SWITCH variable ("" when unset: off). */
  readonly branchSwitchEnv: string;
  readonly rgPath: string;
  readonly disableRipgrep: boolean;
  readonly childEnv: Readonly<Record<string, string>>;
  readonly logLevel: LogLevel;
  readonly home: string;
  /** "threads" in the server; "inline" in tests and wherever worker threads are not wanted. */
  readonly indexRunner: 'threads' | 'inline';
  /** Where log lines go; stderr by default. */
  readonly writeLog?: (line: string) => void;
}
