/**
 * The checks `bun run doctor` runs. Each answers ok, warn or fail with one line of detail and, when
 * something is off, the fix. Nothing here prints a secret: the API key is only measured.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createNodeFileSystem } from '../../src/adapters/fs/node-file-system.ts';
import { loadSqlite } from '../../src/adapters/index/sqlite.ts';
import { bundledRipgrep, locateRipgrep } from '../../src/adapters/search/locate-ripgrep.ts';
import { loadConfig } from '../../src/config/load-config.ts';
import { buildRegistry } from '../../src/config/repo-registry.ts';

export type Level = 'ok' | 'warn' | 'fail';

export interface Check {
  readonly level: Level;
  readonly label: string;
  readonly detail: string;
}

const check = (level: Level, label: string, detail: string): Check => ({ level, label, detail });

export function runtimeCheck(): Check {
  if (typeof Bun !== 'undefined') return check('ok', 'Runtime', `Bun ${Bun.version}`);
  const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
  const ok = major > 22 || (major === 22 && minor >= 18);
  return check(
    ok ? 'ok' : 'fail',
    'Runtime',
    `Node ${process.versions.node}${ok ? '' : ' — needs 22.18+ to run TypeScript directly'}`,
  );
}

export function apiKeyCheck(): Check {
  const length = (process.env['MCP_API_KEY'] ?? '').length;
  if (length >= 24) return check('ok', 'API key', `MCP_API_KEY is set (${length} characters)`);
  return check(
    'fail',
    'API key',
    'MCP_API_KEY is missing or shorter than 24 characters — run bun run setup',
  );
}

export async function reposCheck(projectDir: string): Promise<Check[]> {
  const fs = createNodeFileSystem();
  try {
    const loaded = await loadConfig(fs, {
      path: process.env['CODEBASE_CONFIG'] || join(projectDir, 'codebase.config.json'),
      reposEnv: process.env['REPOS'] ?? '',
      extraBlockedEnv: process.env['EXTRA_BLOCKED'] ?? '',
    });
    const { registry, problems } = await buildRegistry(
      fs,
      loaded.config,
      process.env['HOME'] ?? process.env['USERPROFILE'] ?? '',
    );
    const count = registry.list().length;
    const repos = check(
      count > 0 ? 'ok' : 'fail',
      'Repos',
      `${count} repos from ${loaded.source}${count === 0 ? ' — check the paths in the config' : ''}`,
    );
    return [repos, ...problems.map((problem) => check('warn', 'Repos', problem))];
  } catch (error) {
    return [check('fail', 'Config', error instanceof Error ? error.message : String(error))];
  }
}

export async function ripgrepCheck(projectDir: string): Promise<Check> {
  const path = await locateRipgrep({
    configured: process.env['RG_PATH'] ?? '',
    disabled: false,
    bundled: bundledRipgrep,
    cwd: projectDir,
  });
  return path
    ? check('ok', 'ripgrep', path)
    : check(
        'warn',
        'ripgrep',
        'not runnable here — search uses the index and the JavaScript scanner (slower on very large repos)',
      );
}

export function gitCheck(): Check {
  const result = spawnSync('git', ['--version'], { encoding: 'utf8' });
  const version = /(\d+)\.(\d+)/.exec(result.stdout ?? '');
  if (!version)
    return check('fail', 'git', 'git not found — git_history and change detection need it');
  const ok = Number(version[1]) > 2 || (Number(version[1]) === 2 && Number(version[2]) >= 24);
  return check(
    ok ? 'ok' : 'warn',
    'git',
    `${result.stdout.trim()}${ok ? '' : ' — 2.24+ recommended (--end-of-options)'}`,
  );
}

export async function sqliteCheck(): Promise<Check> {
  try {
    const db = (await loadSqlite())(':memory:', { readonly: false });
    db.exec(
      "CREATE VIRTUAL TABLE t USING fts5(body, tokenize = 'trigram', content = '', contentless_delete = 1, detail = 'none')",
    );
    db.close();
    return check('ok', 'SQLite', 'FTS5 trigram index available');
  } catch (error) {
    return check(
      'fail',
      'SQLite',
      `FTS5 trigram index unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function grammarsCheck(projectDir: string): Check {
  const ids = [
    'java',
    'kotlin',
    'go',
    'typescript',
    'tsx',
    'javascript',
    'python',
    'csharp',
    'php',
    'ruby',
    'rust',
    'scala',
    'c',
    'cpp',
    'elixir',
  ];
  const missing = ids.filter(
    (id) =>
      !existsSync(join(projectDir, 'assets/grammars', `${id}.wasm`)) ||
      !existsSync(join(projectDir, 'assets/queries', `${id}.scm`)),
  );
  return missing.length === 0
    ? check('ok', 'Grammars', `${ids.length} tree-sitter grammars present`)
    : check('fail', 'Grammars', `missing: ${missing.join(', ')} — run bun run grammars:sync`);
}

export async function serverCheck(): Promise<Check> {
  const url = `http://127.0.0.1:${process.env['PORT'] || 8787}/health`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return check(response.ok ? 'ok' : 'warn', 'Server', `${url} answered ${response.status}`);
  } catch {
    return check('warn', 'Server', `not running on ${url} — start it with bun start`);
  }
}

export function tunnelCheck(): Check {
  const tool =
    (process.env['TUNNEL'] || (process.platform === 'win32' ? 'pinggy' : 'cloudflared')) ===
    'pinggy'
      ? 'ssh'
      : 'cloudflared';
  const found =
    spawnSync(tool, [tool === 'ssh' ? '-V' : '--version'], { stdio: 'ignore' }).error === undefined;
  return check(
    found ? 'ok' : 'warn',
    'Tunnel',
    found ? `${tool} available for bun tunnel` : `${tool} not found — needed only for bun tunnel`,
  );
}
