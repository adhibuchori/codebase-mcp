/**
 * Test workspaces: the fixture repos copied into a temporary folder, grouped like a real checkout
 * (work/shop/<repo>), each optionally turned into a git repo with one commit. Git runs without the
 * user's global or system config, so a developer's signing or hooks setup cannot change a test.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { join } from 'node:path';

const FIXTURES = join(import.meta.dirname, '..', '..', '..', 'tests', 'fixtures', 'repos');
const FIXTURE_REPOS = readdirSync(FIXTURES).toSorted();

export interface Workspace {
  /** The temporary folder; holds work/, index/ and the config file. */
  readonly dir: string;
  /** The folder that holds the groups (work/). */
  readonly root: string;
  readonly repoPath: (name: string) => string;
  readonly cleanup: () => void;
}

const GIT_ENV = { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: devNull, GIT_TERMINAL_PROMPT: '0' };

/** Runs git in a folder with an isolated config; throws with git's message when it fails. */
export function git(cwd: string, args: readonly string[]): string {
  const result = spawnSync(
    'git',
    [
      '-c',
      'user.email=test@example.com',
      '-c',
      'user.name=Test',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    {
      cwd,
      encoding: 'utf8',
      env: { PATH: process.env['PATH'] ?? '', ...GIT_ENV },
    },
  );
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout;
}

export function commitAll(cwd: string, message: string): void {
  git(cwd, ['add', '-A']);
  git(cwd, ['commit', '-q', '-m', message]);
}

export function createWorkspace(
  options: { git?: boolean; repos?: readonly string[] } = {},
): Workspace {
  const dir = mkdtempSync(join(tmpdir(), 'codebase-mcp-test-'));
  const root = join(dir, 'work');
  const repoPath = (name: string): string => join(root, 'shop', name);
  for (const name of options.repos ?? FIXTURE_REPOS) {
    mkdirSync(repoPath(name), { recursive: true });
    cpSync(join(FIXTURES, name), repoPath(name), { recursive: true });
    if (options.git !== false) {
      git(repoPath(name), ['init', '-q', '-b', 'main']);
      commitAll(repoPath(name), `feat: import ${name}`);
    }
  }
  return { dir, root, repoPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Writes codebase.config.json for the workspace and returns its path. */
export function writeConfig(workspace: Workspace, extra: Record<string, unknown> = {}): string {
  const path = join(workspace.dir, 'codebase.config.json');
  const config = {
    roots: [{ path: workspace.root, maxDepth: 3 }],
    index: { dir: join(workspace.dir, 'index') },
    ...extra,
  };
  writeFileSync(path, JSON.stringify(config, null, 2));
  return path;
}
