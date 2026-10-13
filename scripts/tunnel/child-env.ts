/**
 * The environment a tunnel program gets: the shell's, minus every key from .env and every known
 * secret. cloudflared prints the environment it sees to its log, so a token passed along would leak
 * (it did, in v1: see .claude/anti-patterns/cloudflared-logs-env-tokens.md).
 */
export const SECRET_KEYS = [
  'MCP_API_KEY',
  'CF_TUNNEL_TOKEN',
  'CF_ACCESS_CLIENT_ID',
  'CF_ACCESS_CLIENT_SECRET',
  'PINGGY_TOKEN',
  'TUNNEL_TOKEN',
];

export function childEnv(
  environment: Readonly<Record<string, string | undefined>>,
  dotenvKeys: readonly string[],
): Record<string, string> {
  const hidden = new Set([...dotenvKeys, ...SECRET_KEYS]);
  return Object.fromEntries(
    Object.entries(environment).filter(
      (entry): entry is [string, string] => entry[1] !== undefined && !hidden.has(entry[0]),
    ),
  );
}
