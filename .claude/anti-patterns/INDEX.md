# Anti-Patterns Index

> Lazy-loaded knowledge base. Load only the file(s) matching your current task. Each file is
> self-contained: symptom, cause, fix, and the signal that it is back.

## Loading guide

| Trigger / task                                                                   | Load                                        |
| -------------------------------------------------------------------------------- | ------------------------------------------- |
| A client connects but cannot validate; `406` in the log                          | mcp-accept-header-406.md                    |
| ClickUp cannot validate; no request from ClickUp in the log                      | cloudflare-bot-fight-mode-blocks-clickup.md |
| `404` for `/` right after connecting a client                                    | clickup-url-needs-mcp-path.md               |
| Touching scripts/tunnel/ or starting any program with secrets in the environment | cloudflared-logs-env-tokens.md              |
| Writing an FTS5 `MATCH` query in src/adapters/index/                             | fts5-detail-none-rejects-phrases.md         |
| Opening, caching or closing SQLite connections; `EBUSY` on a shard on Windows    | bun-sqlite-close-keeps-zombie.md            |
| Writing a `bun test` file that needs a module replaced                           | bun-mock-module-is-process-wide.md          |
| Touching src/http/middlewares/rate-limit.middleware.ts                           | rate-limit-double-next.md                   |
| Writing or editing any check under scripts/check/                                | a-check-that-matches-nothing-passes.md      |
| Adding a lint ignore, or lint flags files it should skip                         | oxlint-ignores-oxlintignore.md              |
| Coverage shows a lone `);` uncovered after oxfmt wrapped a `throw`               | bun-coverage-final-multiline-throw.md       |
| A script starts the server in the background and stops it on exit                | ci-background-function-pid.md               |

## When to add an entry

- It cost real debugging time (more than 30 minutes).
- The root cause is not obvious from reading the code or the docs.
- The same trap is likely to come back (a vendor quirk, an environment difference, a tool gotcha).

When the cause is fixed upstream, delete the file instead of leaving a stale entry. File names are
`<scope>-<short-description>.md`, kebab-case.
