# Security

codebase-mcp exposes local source code to a cloud assistant through a tunnel, so it is built to be
read-only (apart from the opt-in branch switch, off by default) and to keep secrets out of every
answer. The threat model is in
[.claude/rules/security/read-only.md](.claude/rules/security/read-only.md), and the user-facing
summary in the README's "Security model" section.

## Supported versions

Only the latest release gets fixes.

## Reporting a vulnerability

Please report it privately: open a
[security advisory](https://github.com/adhibuchori/codebase-mcp/security/advisories/new) on this
repository, or contact the maintainer directly. Do not open a public issue. Include:

- what can be read, run or reached that should not be;
- the tool call or HTTP request that shows it;
- the version (`bun run doctor` prints it) and the platform.

You will get an answer within a week.

## What counts

| In scope                                                                     | Out of scope                                                                                |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Reading a file outside a configured repo, a `.git/` file or a sensitive name | Anything that needs the API key **and** reads only what the configured repos already expose |
| Running a program or a git subcommand a caller chooses                       | The tunnel provider's own security (Cloudflare, Pinggy)                                     |
| A secret (token, key, password) reaching an answer unredacted                | Denial of service by someone who holds the API key                                          |
| Bypassing the API key, the rate limit or the body limit                      | Findings in the fixture repos under `tests/fixtures/`                                       |
| A git argument injection                                                     |                                                                                             |

## If a secret leaked

Rotate it first, then investigate:

- **`MCP_API_KEY`:** put a new `bun run gen-key` in `.env`, restart the server, and update ClickUp.
- **The Cloudflare tunnel token:** rotate it in the Zero Trust dashboard (_Networks → Tunnels →
  the tunnel → Refresh token_), then update `CF_TUNNEL_TOKEN`.
- **The Cloudflare Access service token:** create a new one, update the Access policy, `.env` and
  the two custom headers in ClickUp, then revoke the old one.
