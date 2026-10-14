/**
 * Loads the configuration from codebase.config.json and the REPOS variable from .env
 * (name=path;name=path). When REPOS is set, it decides which repos are served, replacing the file's
 * roots and repos, so editing REPOS and restarting always serves exactly that list. The file still
 * supplies every other setting; without REPOS, the file decides alone.
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

/** REPOS, when set, is the whole list: the file's roots and repos step aside, its settings stay. */
function withReposEnv(config: AppConfig, repos: RepoConfig[]): AppConfig {
  return repos.length === 0 ? config : { ...config, roots: [], repos };
}

export async function loadConfig(fs: FileSystem, input: ConfigInput): Promise<LoadedConfig> {
  const stat = await fs.stat(input.path);
  const repos = parseReposEnv(input.reposEnv);
  if (stat?.isFile) {
    const config = validate(parseJson(await fs.readText(input.path), input.path), input.path);
    return {
      config: withExtraBlocked(withReposEnv(config, repos), input.extraBlockedEnv),
      source: repos.length > 0 ? `${REPOS_SOURCE} (settings from ${input.path})` : input.path,
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
