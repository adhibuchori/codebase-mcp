/** Which repos a request targets. An unknown name is a ToolError with "did you mean" suggestions. */
import { suggest, ToolError } from '../core/errors/tool-error.ts';
import type { Repo } from '../core/model/domain.types.ts';
import type { RepoRegistry } from '../ports/runtime.ts';

export function requireRepo(registry: RepoRegistry, name: string): Repo {
  const repo = registry.get(name.trim());
  if (repo) return repo;
  const close = suggest(
    name,
    registry.list().map((candidate) => candidate.slug),
  );
  throw new ToolError(
    `Unknown repo "${name}".`,
    close.length > 0
      ? `Did you mean: ${close.join(', ')}? list_repos shows all repos.`
      : 'Call list_repos to see the repo names.',
  );
}

/** The named repos, the repos of a group, or every repo when neither is given. */
export function resolveRepos(
  registry: RepoRegistry,
  names: readonly string[] = [],
  group = '',
): Repo[] {
  const wanted = names.map((name) => requireRepo(registry, name));
  const pool = wanted.length > 0 ? wanted : [...registry.list()];
  if (!group) return pool;
  const inGroup = pool.filter((repo) => repo.group.toLowerCase() === group.toLowerCase());
  if (inGroup.length > 0) return inGroup;
  const groups = [
    ...new Set(
      registry
        .list()
        .map((repo) => repo.group)
        .filter(Boolean),
    ),
  ];
  const hint = groups.length > 0 ? `Groups: ${groups.join(', ')}.` : 'No repo has a group.';
  throw new ToolError(`No repo in group "${group}".`, hint);
}
