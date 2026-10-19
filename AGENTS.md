# AGENTS.md — codebase-mcp

> Enforced guardrails for anyone, human or assistant, changing this repo. Read the Compliance
> Status table first.

Every rule is falsifiable and names its **enforcement**: a lint rule, a check script, a test, a CI
step, or `advisory` (code review). Rule numbers follow the be-hono template of
[agent-config-kit](https://github.com/adhibuchori/agent-config-kit), so "Rule 26" means the same
thing in both. Numbers are append-only: rules about databases and payload sealing do not apply here
and keep their numbers unused. Rules 49 and up are this repo's own.

## Compliance Status

| Section                  | Status         | What that means here                                                                                                                                                          |
| ------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §A Protocol              | Enforced       | Advisory rules, checked in review                                                                                                                                             |
| §B Layer boundaries      | Enforced       | oxlint `no-restricted-imports` per layer, `import/no-cycle`                                                                                                                   |
| §C Errors                | Enforced       | `ToolError` for anything the caller can fix; `defineTool` maps everything else                                                                                                |
| §D Database              | Not applicable | No database. The index is a cache of the repos, rebuilt at will.                                                                                                              |
| §E Testing               | Enforced       | 100% lines and functions per file, real adapters over temporary workspaces                                                                                                    |
| §F Security              | Enforced       | See Rule 52 and `.claude/rules/security/read-only.md`                                                                                                                         |
| §G Code quality          | Enforced       | oxlint (type-aware), oxfmt, knip, comment style, folder shape                                                                                                                 |
| §H Query and performance | Partial        | Rule 29 (bounded reads) applies to every tool; the SQL rules do not apply                                                                                                     |
| §I Runtime hardening     | Partial        | Request id, secure headers, body limit and rate limit on `/mcp`; there is no CORS (no browser clients) and no request timeout, since search stops at `limits.searchTimeoutMs` |
| §M MCP                   | Enforced       | Rules 49–54                                                                                                                                                                   |

**Known behaviour that looks like a bug and is not:**

- `/health` answers `{"ok": true}` and nothing else, on purpose: it is reachable through the tunnel
  without a key.
- A repo whose index is not ready is still searched, by reading files directly. Its line in
  `list_repos` says `not indexed` or `indexing N%`.

---

## §A. Protocol

| #   | Rule                                                                                                                                                                                     | Enforcement |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | **Read first.** Name every file a change touches before writing code. Commits are `type: description` (no scope); branches are `internal/<scope>`.                                       | advisory    |
| 2   | **Simplicity first.** Reuse before writing, in this order: this codebase, the standard library (Web APIs, Node and Bun built-ins), Hono and the MCP SDK, a dependency already installed. | advisory    |
| 3   | **Surgical changes.** Do not touch or reformat files outside the task.                                                                                                                   | advisory    |
| 4   | **A tool calls a service.** `<name>.tool.ts` → `<domain>.service.ts` (decisions) → `<domain>.format.ts` (text). Shared logic used by several tools lives in `src/engine/`.               | advisory    |

## §B. Layer Boundaries

**Rule 5: Layer ownership.**

| Layer          | Folder                                                         | Responsibility                                                                      |
| -------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Domain         | `src/core/`                                                    | Pure functions: ranking, budgets, cursors, trigrams, path rules, redaction, parsing |
| Language packs | `src/languages/<id>/`                                          | Pure data and extractors per language                                               |
| Ports          | `src/ports/`                                                   | Interfaces only                                                                     |
| Engine         | `src/engine/`                                                  | Application services on ports                                                       |
| Tools          | `src/tools/<domain>/`                                          | Input schema, a thin `run`, formatting                                              |
| Adapters       | `src/adapters/`                                                | Every I/O: file system, processes, SQLite, WASM, git                                |
| Indexer        | `src/indexer/`                                                 | Builds shards from adapters and packs                                               |
| HTTP           | `src/http/`                                                    | Middlewares and the MCP transport                                                   |
| Composition    | `src/composition/`, `src/app.ts`, `src/index.ts`, `src/env.ts` | Wiring; no logic                                                                    |

Enforcement: `.oxlintrc.json` overrides with `no-restricted-imports`.

**Rule 6: Tools never touch I/O.** A tool imports from `core/`, `engine/` and `ports/` only: never
`adapters/`, `http/`, `indexer/`, `node:fs` or `node:child_process`. Enforcement: lint override for
`src/tools/**`.

**Rule 7: core, languages and services are pure.** `core/` and `languages/` do no I/O and import
no framework. Engine services receive an `EngineDeps` object; tests build a real one around a
temporary workspace (`src/testing/helpers/`). No container, and no `mock.module`. Shared test
doubles live in `src/testing/`. Enforcement: lint overrides for `core`, `languages` and `engine`;
`scripts/check/module-mocks.ts`.

**Rule 8: One entry per tool domain.** `src/tools/registry/build-server.ts` imports each domain
through its `index.ts`. Enforcement: advisory.

**Rule 9: Outer layers never reach back.** `adapters/`, `indexer/` and `http/` never import
`engine/` or `tools/`. Enforcement: lint override for `src/adapters/**` and `src/indexer/**`.

## §C. Errors

**Rule 11: Two kinds of error.** A problem the caller can fix (unknown repo, bad reference,
invalid regex, file too large) is thrown as `ToolError(message, hint)`, and the hint carries a valid
example. Anything else is logged with its stack, and the caller gets a generic "Internal error".
Enforcement: `src/tools/registry/define-tool.ts` plus its tests.

**Rule 12: Error text is client-safe.** A `ToolError` message names repo-relative paths only:
never an absolute path, a stack, or an environment value. Enforcement: advisory, plus
`redactSecrets` on every answer.

## §E. Testing

**Rule 19: Every source file has tests**, in the `__tests__/` folder beside it, at 100% of lines
and functions. Enforcement: `bunfig.toml` threshold, `scripts/check/coverage-files.mjs`,
`scripts/check/coverage-policy.mjs`.

**Rule 20: Tests run on real adapters over temporary folders.** They use git repos made from
`tests/fixtures/repos/`, real ripgrep and real SQLite. They never touch the network or your own
repos, and they don't depend on the developer's git config. Enforcement:
`src/testing/helpers/workspace.ts` (isolated git config), review.

**Rule 21: Tool tests go through the real HTTP app.** `startTestRuntime` calls tools through
`createApp` (API key, JSON-RPC, the MCP transport), so a test passes only when ClickUp would get
the same answer. Enforcement: review.

## §F. Security

**Rule 22: Only `src/env.ts` reads `process.env`.** Scripts under `scripts/` may read it too.
Enforcement: oxlint `no-restricted-properties`.

**Rule 23: No `console.*` in `src/`.** Use the `Logger` port; only the logger adapter writes to
stderr. stdout belongs to the stdio transport. Enforcement: oxlint `no-console`.

**Rule 24: The rate limit decides before `next()`** and never wraps it, so a request is never
answered twice. Enforcement: `src/http/middlewares/rate-limit.middleware.ts` and its tests;
`.claude/anti-patterns/rate-limit-double-next.md`.

**Rule 25: No `.env` file or secret is ever committed.** Enforcement: `.gitignore`, gitleaks in
pre-commit and CI (`scripts/check/secrets.sh`), and the Claude Code hook `block-env.py`.

## §G. Code Quality

**Rule 26: At most 200 lines per file**, not counting blank lines or comments. Split by domain.
Enforcement: oxlint `max-lines`.

**Rule 27: No disable comments.** Fix the cause. Enforcement: `reportUnusedDisableDirectives`,
review.

**Rule 28: A tool's `run` stays at 15 lines or fewer.** Anything longer is a service. Functions
anywhere are at most 40 lines, with complexity 10, depth 4, 3 parameters and 3 nested callbacks.
Enforcement: oxlint `max-lines-per-function`, `complexity`, `max-depth`, `max-params`,
`max-nested-callbacks`.

**Rule 42: No `any`,** tests included, and no double assertion through `unknown`. Enforcement:
`typescript/no-explicit-any`, `scripts/check/double-assertion.sh`.

**Rule 43: One home per identifier.** A literal that two places must spell the same way (a tool
name, a limit, a flag) is defined once and imported. Enforcement: advisory.

## §H. Query and Performance

**Rule 29: No unbounded reads.** Every list has a default limit and a hard cap. Every search has a
match limit and a deadline (`limits.searchTimeoutMs`), and every answer has a character budget.
Enforcement: the tools' zod schemas, `pickLevel`/`takeBlocks`, tests with tiny budgets.

## §I. Runtime and HTTP Hardening

**Rule 40: Every request carries a request id**, set by the first middleware. Enforcement:
`src/app.ts`.

**Rule 41: `/mcp` checks the body size (1 MB), the rate limit and the API key, in that order,
before any tool runs.** Secure headers apply to every answer. Enforcement: `src/app.ts`,
`src/__tests__/app.test.ts`.

## §M. MCP

**Rule 49: Every answer is bounded.** It has a default limit, a hard character budget and a cursor
or a narrowing hint. It steps down in detail (`pickLevel`) before it truncates. Enforcement: tests
with a 500-token budget, `.claude/rules/mcp/tool-design.md`.

**Rule 50: The same source runs on Bun and on Node 22.18+.** `Bun.*` appears only in
`src/adapters/runtime/` and `src/adapters/index/sqlite.ts`. Imports carry `.ts` extensions, and
only erasable TypeScript syntax is used. Enforcement: oxlint `no-restricted-globals`, tsconfig
`erasableSyntaxOnly`, the CI job that boots the server on Node without ripgrep.

**Rule 51: Answers are text, and references are inputs.**

- Every location is printed as `repo/path:line`, and `read_code` accepts that exact form.
- There is no `structuredContent`.
- A tool description is 3–4 sentences plus one JSON example, under 2,048 characters.

Enforcement: tests, review.

**Rule 52: Read-only by construction, with one opt-in exception.**

- No tool writes, deletes or runs anything a caller chooses. The one exception is `switch_branch`,
  registered only when `ALLOW_BRANCH_SWITCH` allows a repo. It switches to a local branch, or creates
  one from a remote branch already fetched, with one fixed command (no fetch, no force, no hooks, no
  network) and refuses a repo with uncommitted changes. Any other write changes this rule first.
- Programs are started with an argument array, never a shell: `git` with fixed subcommands
  (read-only, plus that one `switch`), and ripgrep.
- Every path goes through `resolveFile` (`src/engine/file-access.ts`).
- Every answer goes through `redactSecrets`.

Enforcement: `src/core/security/` tests, `src/adapters/git/__tests__/git-reader.test.ts` (injection
attempts), `src/tools/files/__tests__/files.tools.test.ts` (traversal, symlinks, `.env`),
`src/adapters/git/__tests__/git-switcher.test.ts` (hooks, git guessing a remote branch,
partial-clone fetches) and `src/tools/branches/__tests__/switch-branch.tool.test.ts` (off by default, refusals).

**Rule 53: Measure before and after.** A change to ranking, budgets, formats or extractors runs
`bun run eval`, and `bun run bench` when speed may change. Results that move go in
`docs/benchmarks.md`. Enforcement: review.

**Rule 54: Comments are `/** */` or `/* */`.** `//` is allowed only for tool directives. The
fixture repos in `tests/fixtures/` are exempt, since they mimic other stacks. Enforcement:
`scripts/check/comment-style.mjs` in pre-commit, CI and the post-edit hook.

---

## How to add a language

1. Create `src/languages/<id>/pack.ts` exporting a `LanguagePack`, with:
   - `id`, `name`, `tier` and `extensions`;
   - optional `fileNames`, the `grammar` id, `symbolPatterns` (the fallback), `routeExtractors`,
     `frameworks` and `logCall`.
2. A stack parser goes in `src/languages/<id>/stack.ts`. Add it to `STACK_PARSERS`.
3. Add the pack to `PACKS` in `src/languages/registry/language-registry.ts`.
4. For a grammar:
   - add the npm package and its version to `scripts/grammars/grammars.ts`;
   - run `bun run grammars:sync`;
   - add `assets/queries/<id>.scm` when the package has no `tags.scm`.
5. Tests in `src/languages/<id>/__tests__/`, at 100%. When the language matters for the eval, add a
   fixture repo in `tests/fixtures/repos/` and scenarios in
   `tests/fixtures/eval/fixture-scenarios.json`.

## How to add a tool

Think twice first: more tools cost tokens on every request and make selection harder. Prefer a new
mode on an existing tool. If a tool is still needed:

1. `src/tools/<domain>/<name>.tool.ts`: the zod input, the description, and a `run` of 15 lines or
   fewer.
2. `<domain>.service.ts` for the decisions, and `<domain>.format.ts` for the text.
3. Register it in `src/tools/registry/build-server.ts` and mention it in
   `src/tools/registry/instructions.ts`.
4. Tests through `startTestRuntime`. Document it in `docs/tools.md` and in both READMEs.

## Core files: handle with care

| File                                 | Why                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------ |
| `src/tools/registry/define-tool.ts`  | Validation, redaction, budget and the error contract for every tool      |
| `src/core/security/*`                | Path rules, sensitive names, redaction, git input validation             |
| `src/engine/file-access.ts`          | The path jail                                                            |
| `src/adapters/git/git-command.ts`    | git hardening                                                            |
| `src/app.ts`                         | Middleware order (Rule 41)                                               |
| `src/adapters/index/shard-schema.ts` | Bump `SCHEMA_VERSION` when the schema changes; shards rebuild themselves |
