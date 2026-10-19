/**
 * Which repos switch_branch may touch, from ALLOW_BRANCH_SWITCH: off when unset, every repo for
 * "1", "true" or "all", or a comma-separated list of repo names. Switching is the only change the
 * server can make, so it is off unless the owner turns it on.
 */
export type BranchSwitchPolicy =
  | { readonly mode: 'off' }
  | { readonly mode: 'all' }
  | { readonly mode: 'repos'; readonly repos: readonly string[] };

const OFF = new Set(['', '0', 'false', 'no', 'off']);
const ALL = new Set(['1', 'true', 'yes', 'on', 'all']);

export function parseBranchSwitch(value: string): BranchSwitchPolicy {
  const normal = value.trim().toLowerCase();
  if (OFF.has(normal)) return { mode: 'off' };
  if (ALL.has(normal)) return { mode: 'all' };
  const repos = normal
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  return { mode: 'repos', repos };
}

export function allowsSwitch(policy: BranchSwitchPolicy, slug: string): boolean {
  if (policy.mode === 'off') return false;
  return policy.mode === 'all' || policy.repos.includes(slug.toLowerCase());
}

/** "every repo", "orders, payments", or "" when off: for the banner and the tool description. */
export function describeBranchSwitch(policy: BranchSwitchPolicy): string {
  if (policy.mode === 'off') return '';
  return policy.mode === 'all' ? 'every repo' : policy.repos.join(', ');
}
