/** The lines `bun start` prints: where the server listens and what it can read. */
import type { Repo } from '../core/model/domain.types.ts';
import { plural } from '../core/output/trim.ts';

export interface BannerInput {
  readonly version: string;
  /** "bun 1.3.12" or "node 22.23.2". */
  readonly runtime: string;
  readonly url: string;
  readonly repos: readonly Repo[];
  readonly configSource: string;
  readonly ripgrep: string | null;
  readonly indexEnabled: boolean;
  readonly problems: readonly string[];
}

export function bannerLines(input: BannerInput): string[] {
  const groups = new Set(input.repos.map((repo) => repo.group).filter(Boolean));
  const sample = input.repos
    .slice(0, 8)
    .map((repo) => repo.slug)
    .join(', ');
  return [
    `codebase-mcp ${input.version} on ${input.runtime} · MCP endpoint ${input.url}/mcp · read-only`,
    `${plural(input.repos.length, 'repo')}${groups.size > 0 ? ` in ${plural(groups.size, 'group')}` : ''} from ${input.configSource}: ${sample}${input.repos.length > 8 ? ', …' : ''}`,
    `Search: ${input.ripgrep ? 'ripgrep' : 'JavaScript scanner (ripgrep unavailable)'} + ${input.indexEnabled ? 'background index' : 'no index (disabled in config)'}`,
    ...input.problems.map((problem) => `warning: ${problem}`),
    'Open the tunnel in another terminal with: bun tunnel. Stop with Ctrl+C.',
  ];
}

export const USAGE = [
  'Usage: bun src/index.ts <command>',
  '  start   run the HTTP MCP server (default)',
  '  stdio   run the MCP server on stdin/stdout, for local clients such as Claude Code',
  '  index   build or refresh the index of every repo, then exit',
].join('\n');

/** True for a key long enough to resist guessing (the generator makes 64 hex characters). */
export function strongEnough(key: string): boolean {
  return key.length >= 24;
}
