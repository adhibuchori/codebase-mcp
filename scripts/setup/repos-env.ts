/**
 * The REPOS line of .env, which decides which repos are served when it is set. Setup adds repos to
 * it without touching any other line; a folder that is already listed is not added twice, and a
 * name that is taken gets a numbered suffix.
 */
import type { RepoConfig } from '../../src/config/config-schema.ts';
import { parseReposEnv } from '../../src/config/load-config.ts';
import type { FileOps } from './api-key.ts';

export interface RepoEntry {
  readonly name: string;
  readonly path: string;
}

export interface AddedRepos {
  readonly added: readonly RepoEntry[];
  readonly alreadyListed: readonly string[];
}

const REPOS_LINE = /^REPOS=(.*)$/m;

export interface EnvFiles {
  /** The .env file that holds REPOS. */
  readonly env: string;
  /** The template a missing .env file starts from. */
  readonly example: string;
}

function normal(path: string): string {
  return path.replaceAll('\\', '/').replace(/\/+$/, '');
}

function folderName(path: string): string {
  return normal(path).split('/').at(-1) || path;
}

/** "name=path" or a bare path, several separated by ";". A bare path is named after its folder. */
export function parseRepoInput(input: string): RepoEntry[] {
  return input
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const at = part.indexOf('=');
      if (at === 0) return null;
      return at > 0
        ? { name: part.slice(0, at).trim(), path: part.slice(at + 1).trim() }
        : { name: folderName(part), path: part };
    })
    .filter(
      (entry): entry is RepoEntry => entry !== null && entry.name !== '' && entry.path !== '',
    );
}

function uniqueName(name: string, taken: ReadonlySet<string>): string {
  let candidate = name;
  for (let n = 2; taken.has(candidate); n++) candidate = `${name}-${n}`;
  return candidate;
}

function merge(current: readonly RepoConfig[], wanted: readonly RepoEntry[]) {
  const list: RepoEntry[] = current.map(({ name, path }) => ({ name, path }));
  const added: RepoEntry[] = [];
  const alreadyListed: string[] = [];
  for (const entry of wanted) {
    if (list.some((listed) => normal(listed.path) === normal(entry.path))) {
      alreadyListed.push(entry.path);
      continue;
    }
    const repo = {
      name: uniqueName(entry.name, new Set(list.map((l) => l.name))),
      path: entry.path,
    };
    list.push(repo);
    added.push(repo);
  }
  return { list, added, alreadyListed };
}

/** Adds repos to REPOS in the .env file (created from the example when missing). */
export function addRepos(
  paths: EnvFiles,
  wanted: readonly RepoEntry[],
  files: FileOps,
): AddedRepos {
  const text = files.exists(paths.env)
    ? files.read(paths.env)
    : files.exists(paths.example)
      ? files.read(paths.example)
      : '';
  const value =
    REPOS_LINE.exec(text)?.[1]
      ?.trim()
      .replace(/^(["'])(.*)\1$/, '$2') ?? '';
  const { list, added, alreadyListed } = merge(parseReposEnv(value), wanted);
  if (added.length === 0) return { added, alreadyListed };
  const line = `REPOS=${list.map((repo) => `${repo.name}=${repo.path}`).join(';')}`;
  const updated = REPOS_LINE.test(text)
    ? text.replace(REPOS_LINE, line)
    : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`;
  files.write(paths.env, updated);
  return { added, alreadyListed };
}
