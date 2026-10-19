---
paths:
  - 'src/**'
  - 'scripts/tunnel/**'
---

# Read-only by construction

This server exposes local code to a cloud assistant through a tunnel. `AGENTS.md` §F holds the
numbered rules; this is the threat model behind them.

- **No write path, except one the owner turns on.** No tool writes, deletes or runs anything a
  user can choose. Programs started: `git` (fixed read-only subcommands) and `rg`, both through
  `spawnCollect` with an argument array, never a shell. The exception is `switch_branch`, listed
  only when `ALLOW_BRANCH_SWITCH` allows a repo: one fixed `git switch --no-guess` to a local
  branch, or creating one from a remote branch already fetched (`adapters/git/git-switcher.ts`), with `protocol.allow=never`, no hooks, no
  submodules or LFS downloads, no force, and a refusal while tracked files have changes. The worst a
  prompt injection can do through it is switch a branch, which the log records and the owner can
  undo.
- **Paths are jailed.** Every user path goes through `normalizeRelative` and
  `engine/file-access.ts#resolveFile`: no absolute paths, no `..` out of the repo, symlinks resolved
  and checked again, `.git` and sensitive names refused on the real path too.
- **Secrets stay hidden three times.** Sensitive names (`core/security/sensitive-name.ts`, plus the
  config's `blocked`) are never listed, indexed, searched or shown in a diff; ripgrep gets matching
  exclusion globs; every answer passes `redactSecrets` before it leaves.
- **git is hardened** after the CVEs in the reference git MCP server: values validated in
  `core/security/git-input.ts`, `--end-of-options` before revisions (except `blame`, which takes only
  the fixed `HEAD`), `--literal-pathspecs`, no system or global config, `core.fsmonitor=false`, no
  pager, no prompts, no external diff or textconv.
- **Regex is safe.** ripgrep's engine is linear. The JavaScript fallback refuses nested quantifiers
  and back-references (`assertSafeRegex`).
- **Auth before tools.** `/mcp` checks the body size, the rate limit and the API key, in that
  order, before a tool runs. The key is compared in constant time on hashes. `/health` reveals
  nothing.
- **Child processes get no secrets.** `src/env.ts` hands git and ripgrep an allow-listed
  environment; the tunnel script strips every `.env` key and known secret before starting
  cloudflared or ssh.
- **Untrusted text.** File contents and commit messages may contain instructions aimed at the
  model. The server never acts on them; it only returns them as data.
