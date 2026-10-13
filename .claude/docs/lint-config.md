# Why the lint and format configs say what they say

`.oxlintrc.json` and `.oxfmtrc.json` are plain JSON, so they carry no comments. The reasons behind
their choices live here. Adapted from agent-config-kit's be-hono template.

## .oxlintrc.json rules

| Rule | Why |
| --- | --- |
| `max-lines` 200 (blank lines and comments not counted) | AGENTS.md Rule 26: a file that grows past it is split by domain. |
| `max-lines-per-function` 40, `complexity` 10, `max-depth` 4, `max-params` 3, `max-nested-callbacks` 3 | Small, flat functions; more than three inputs become an options object. |
| `no-await-in-loop` | Independent I/O runs through `mapLimit` or `Promise.all`; a deliberate sequence is written as recursion, so the intent is visible. |
| `typescript/no-floating-promises` (with `checkThenables`), `no-misused-promises`, `await-thenable` | A dropped `await` type-checks and silently never runs. Type-aware: needs `oxlint-tsgolint` (TypeScript 7). |
| `typescript/only-throw-error` | Every thrown value is an `Error` (`ToolError` for messages the model sees). |
| `typescript/no-explicit-any`, `consistent-type-imports` | AGENTS.md Rule 42; `import type` keeps Node's type stripping working. |
| `unicorn/filename-case` kebab-case | Paths are guessable; `*.tool.ts`, `*.service.ts`, `*.format.ts`, `*.middleware.ts` suffixes carry the role. |
| `no-console` | Only `src/adapters/logger/` writes to the console (stderr, so stdio mode keeps stdout clean). |
| `no-restricted-properties` on `process.env` | AGENTS.md Rule 22: `src/env.ts` reads and validates the environment once. |
| `no-restricted-globals` on `Bun` | AGENTS.md Rule 50: the same source runs on Node 22.18+, so Bun APIs stay in the runtime adapters. |
| `reportUnusedDisableDirectives` | AGENTS.md Rule 27: no disable comments; a stale one is an error too. |

## .oxlintrc.json overrides

| Files | Why |
| --- | --- |
| `**/__tests__/**` | Tests may hold long `describe` blocks and await in loops on purpose (ordering). They may import `bun:test` from any layer, read `process.env` (PATH for child processes), use `Bun`, take more than three parameters in a local helper, and define helpers inline next to the assertion that uses them. |
| `scripts/**`, `.claude/hooks/**` | Developer scripts: console output is their interface, they read their own environment, and may use Bun APIs. |
| `src/env.ts`, `src/testing/**` | The one environment reader, and the test harness that pins `PATH` for git. |
| `src/adapters/runtime/**`, `src/adapters/index/sqlite.ts` | The runtime adapters: the only places that branch on Bun. |
| `src/adapters/logger/**` | The logger is the console's only user. |
| `src/core/**`, `src/languages/**` | Pure: no I/O, no framework, no outer layer (`.claude/rules/architecture/hexagonal.md`). |
| `src/engine/**` | Talks to the world through `ports/` only. |
| `src/tools/**` | Thin glue: no I/O, no adapters, no HTTP. |
| `src/adapters/**`, `src/indexer/**` | Never reach back into the application layers. |

## ignorePatterns in .oxlintrc.json and .oxfmtrc.json

oxlint reads `.eslintignore`, not `.oxlintignore`, so the lint ignores live in `ignorePatterns`
inside `.oxlintrc.json`, next to the rules they relax. `tests/fixtures/` holds miniature
repositories of other stacks: data, not this program. `assets/` holds the vendored grammars and
queries.

The checks copied from agent-config-kit
(`scripts/check/{comment-style,coverage-files,coverage-policy,folder-shape,readme-pair}.mjs`,
`module-mocks.ts`) are neither formatted nor linted here, so a kit update stays a plain copy. They
are byte-identical to the kit with two exceptions:

- `folder-shape.mjs` exempts the fixture repos.
- `readme-pair.mjs` has a `--staged` mode for pre-commit, and finds the repo root from
  `scripts/check/`.
