/**
 * git_history's work. Every value is validated (revision, date, pickaxe text, line range, path)
 * before it reaches the git adapter, which adds --end-of-options as a second layer.
 */
import { ToolError } from '../../core/errors/tool-error.ts';
import type { Repo } from '../../core/model/domain.types.ts';
import {
  parseLineRange,
  validatePickaxe,
  validateRevision,
  validateSince,
} from '../../core/security/git-input.ts';
import { blockedReason, normalizeRelative } from '../../core/security/path-rules.ts';
import { resolveFile } from '../../engine/file-access.ts';
import { requireRepo } from '../../engine/repo-scope.ts';
import type { BlameLine, CommitDetail, CommitSummary } from '../../ports/git.ts';
import type { ToolContext } from '../registry/define-tool.ts';

export interface HistoryArgs {
  readonly repo: string;
  readonly action: 'log' | 'pickaxe' | 'blame' | 'show';
  readonly path?: string | undefined;
  readonly query?: string | undefined;
  readonly regex: boolean;
  readonly rev?: string | undefined;
  readonly lines?: string | undefined;
  readonly since?: string | undefined;
  readonly limit: number;
}

export type History =
  | {
      readonly action: 'log' | 'pickaxe';
      readonly repo: Repo;
      readonly commits: readonly CommitSummary[];
      readonly scope: string;
    }
  | {
      readonly action: 'blame';
      readonly repo: Repo;
      readonly path: string;
      readonly lines: readonly BlameLine[];
    }
  | { readonly action: 'show'; readonly repo: Repo; readonly detail: CommitDetail };

function safePath(context: ToolContext, input: string | undefined): string {
  if (!input) return '';
  const path = normalizeRelative(input);
  const reason = blockedReason(path, context.deps.blocked);
  if (reason) throw new ToolError(reason);
  return path;
}

function required(value: string | undefined, name: string, example: string): string {
  if (!value) throw new ToolError(`This action needs "${name}".`, `Example: ${example}`);
  return value;
}

async function blame(context: ToolContext, repo: Repo, args: HistoryArgs): Promise<History> {
  const file = await resolveFile(
    context.deps,
    repo,
    required(args.path, 'path', '{"action": "blame", "path": "src/App.java", "lines": "40-80"}'),
  );
  const range = parseLineRange(args.lines ?? '1-80', 200);
  return {
    action: 'blame',
    repo,
    path: file.path,
    lines: await context.deps.git.blame(repo, file.path, range),
  };
}

export async function history(args: HistoryArgs, context: ToolContext): Promise<History> {
  const repo = requireRepo(context.deps.repos, args.repo);
  if (!(await context.deps.git.isRepo(repo)))
    throw new ToolError(`${repo.slug} is not a git repository.`);
  const path = safePath(context, args.path);
  if (args.action === 'blame') return blame(context, repo, args);
  if (args.action === 'show') {
    const rev = validateRevision(required(args.rev, 'rev', '{"action": "show", "rev": "a1b2c3d"}'));
    return { action: 'show', repo, detail: await context.deps.git.show(repo, rev, 300) };
  }
  const since = args.since ? validateSince(args.since) : '';
  if (args.action === 'pickaxe') {
    const text = validatePickaxe(
      required(args.query, 'query', '{"action": "pickaxe", "query": "Order already cancelled"}'),
    );
    return {
      action: 'pickaxe',
      repo,
      scope: `${args.regex ? 'diff lines matching' : 'commits that added or removed'} "${text}"`,
      commits: await context.deps.git.pickaxe(repo, {
        limit: args.limit,
        path,
        text,
        regex: args.regex,
      }),
    };
  }
  const rev = args.rev ? validateRevision(args.rev) : '';
  const commits = await context.deps.git.log(repo, { limit: args.limit, path, since, rev });
  return {
    action: 'log',
    repo,
    scope: `${path || 'the whole repo'}${since ? ` since ${args.since}` : ''}`,
    commits,
  };
}
