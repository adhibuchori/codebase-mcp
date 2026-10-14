/**
 * Loads the configuration: codebase.config.json when it exists, plus the repos of the REPOS variable
 * from .env (name=path;name=path). REPOS alone is enough, so a v1 setup keeps working without
 * changes, and editing REPOS then restarting the server always takes effect.
 */
import { z } from 'zod';
import type { FileSystem } from '../ports/file-system.ts';
import { configSchema, type AppConfig, type RepoConfig } from './config-schema.ts';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface ConfigInput {
  readonly path: string;
  /** The REPOS variable ("" when unset). */
  readonly reposEnv: string;
  /** The EXTRA_BLOCKED variable: comma-separated regexes ("" when unset). */
  readonly extraBlockedEnv: string;
}

export interface LoadedConfig {
  readonly config: AppConfig;
  readonly source: string;
}

const REPOS_SOURCE = 'REPOS in .env';

/** REPOS="core=/Users/me/work/core-api;web=C:/work/web-app" */
export function parseReposEnv(value: string): RepoConfig[] {
  return value
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const at = part.indexOf('=');
      if (at < 1) return [];
      return [{ name: part.slice(0, at).trim(), path: part.slice(at + 1).trim(), group: '' }];
    });
}

function parseJson(text: string, path: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ConfigError(
      `${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function validate(raw: unknown, source: string): AppConfig {
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success)
    throw new ConfigError(`${source} is invalid:\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

function withExtraBlocked(config: AppConfig, extra: string): AppConfig {
  const patterns = extra
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  return patterns.length === 0 ? config : { ...config, blocked: [...config.blocked, ...patterns] };
}

/**
 * The file's repos, then REPOS, then what the roots find. A folder listed twice is served once,
 * under the first name it was given (repo registry), so a name written by hand wins.
 */
function withReposEnv(config: AppConfig, repos: readonly RepoConfig[]): AppConfig {
  return repos.length === 0 ? config : { ...config, repos: [...config.repos, ...repos] };
}

export async function loadConfig(fs: FileSystem, input: ConfigInput): Promise<LoadedConfig> {
  const stat = await fs.stat(input.path);
  const repos = parseReposEnv(input.reposEnv);
  if (stat?.isFile) {
    const config = validate(parseJson(await fs.readText(input.path), input.path), input.path);
    return {
      config: withExtraBlocked(withReposEnv(config, repos), input.extraBlockedEnv),
      source: repos.length > 0 ? `${input.path} + ${REPOS_SOURCE}` : input.path,
    };
  }
  if (repos.length > 0) {
    return {
      config: withExtraBlocked(validate({ repos }, 'REPOS'), input.extraBlockedEnv),
      source: REPOS_SOURCE,
    };
  }
  throw new ConfigError(
    `No repos configured: ${input.path} does not exist and REPOS is empty. Run "bun run setup" to create the config.`,
  );
}
