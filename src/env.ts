/**
 * The only file in src/ that reads process.env (AGENTS.md Rule 22). Values come from the
 * environment, then from the project's .env file (the environment wins), and are validated once.
 * Child processes (git, ripgrep) get an allow-listed copy, so no secret reaches them.
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { parseDotEnv } from './config/dotenv.ts';

const CHILD_ENV_KEYS = [
  'PATH',
  'Path',
  'PATHEXT',
  'SystemRoot',
  'SYSTEMROOT',
  'windir',
  'ComSpec',
  'HOME',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'TEMP',
  'TMP',
  'TMPDIR',
  'LANG',
  'APPDATA',
  'LOCALAPPDATA',
  'ProgramData',
  'ProgramFiles',
];

const schema = z.object({
  MCP_API_KEY: z.string().default(''),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8787),
  HOST: z.string().min(1).default('127.0.0.1'),
  CODEBASE_CONFIG: z.string().default(''),
  REPOS: z.string().default(''),
  EXTRA_BLOCKED: z.string().default(''),
  RG_PATH: z.string().default(''),
  CODEBASE_NO_RIPGREP: z.string().default(''),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export interface AppEnv {
  readonly apiKey: string;
  readonly port: number;
  readonly host: string;
  readonly configPath: string;
  readonly reposEnv: string;
  readonly extraBlocked: string;
  readonly rgPath: string;
  readonly disableRipgrep: boolean;
  readonly logLevel: 'debug' | 'info' | 'warn' | 'error';
  readonly childEnv: Readonly<Record<string, string>>;
  readonly home: string;
}

function definedOnly(source: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

export function loadEnv(projectDir: string): AppEnv {
  const file = join(projectDir, '.env');
  const fromFile = existsSync(file)
    ? Object.fromEntries(parseDotEnv(readFileSync(file, 'utf8')))
    : {};
  const environment = definedOnly(process.env);
  const parsed = schema.safeParse({ ...fromFile, ...environment });
  if (!parsed.success) throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  const values = parsed.data;
  return {
    apiKey: values.MCP_API_KEY,
    port: values.PORT,
    host: values.HOST,
    configPath: values.CODEBASE_CONFIG || join(projectDir, 'codebase.config.json'),
    reposEnv: values.REPOS,
    extraBlocked: values.EXTRA_BLOCKED,
    rgPath: values.RG_PATH,
    disableRipgrep: values.CODEBASE_NO_RIPGREP === '1' || values.CODEBASE_NO_RIPGREP === 'true',
    logLevel: values.LOG_LEVEL,
    childEnv: Object.fromEntries(
      CHILD_ENV_KEYS.flatMap((key) => (environment[key] ? [[key, environment[key]]] : [])),
    ),
    home: homedir(),
  };
}
