/**
 * Server instructions: the short guide an MCP client may show the model on connect. Kept well
 * under 2,048 characters (Claude Code truncates longer instructions). `switchable` names the repos
 * switch_branch may touch ("" when it is off).
 */
export function serverInstructions(repoCount: number, switchable = ''): string {
  return [
    switchable
      ? `Access to ${repoCount} local code repositories. Nothing can be changed except the checked-out branch: switch_branch lists and switches local branches (allowed for ${switchable}). Switch only when the user asks for a branch.`
      : `Read-only access to ${repoCount} local code repositories. Nothing can be changed through these tools.`,
    'Work from broad to narrow:',
    '1. list_repos shows each service: languages, frameworks, endpoints, topics, last commit. Filter it by name, group or language.',
    '2. search_code finds text in every repo at once (literal by default, ranked, grouped by file). Narrow with repos, path or mode.',
    '3. find_symbol jumps to definitions (or references) by name. read_code with mode "outline" shows a file\'s structure; read_code "repo/path#Name" reads one function.',
    'Debugging: paste a stack trace, a log line, an error message or a URL into triage_error. find_endpoint maps an HTTP route, gRPC method or topic to its handler and its callers across services. git_history shows recent commits, when a string appeared (pickaxe), blame and a commit diff.',
    'Every result uses references like repo/path:line that you can pass to read_code. Answers are capped; follow the hint or the cursor to see more.',
  ].join('\n');
}
