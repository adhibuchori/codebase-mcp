# codebase-mcp — Claude Code config

> Read [AGENTS.md](AGENTS.md) for the numbered rules. Its Compliance Status table says which
> sections bind here.

## Project snapshot

A read-only MCP server that serves the code of many local repos to ClickUp Brain through a tunnel.
It is TypeScript on Bun (Node 22.18+ as a fallback), built with:

- Hono and the MCP SDK's Web-standard transport;
- a SQLite FTS5 trigram index per repo;
- tree-sitter WASM grammars;
- ripgrep.

- Dev server: `bun start` on `127.0.0.1:8787`, MCP at `/mcp`, liveness at `/health`.
- The architecture is in [docs/architecture.md](docs/architecture.md), the tools in
  [docs/tools.md](docs/tools.md), and the measurements in [docs/benchmarks.md](docs/benchmarks.md).

## Quality gates

Run them before you say a change is done:

```bash
bun run fl                    # oxfmt + oxlint (type-aware)
bun run type-check            # tsc 7, strict
bun run test:coverage         # 100% lines and functions per file
bash scripts/check/gates.sh   # all of it, plus comments, knip, folder shape, mocks, secrets, README pair
```

A change to ranking, budgets, formats or extractors also runs `bun run eval` (Rule 53).

## `.env` files

Never read, print or edit any `.env` file. The `block-env.py` hook refuses tool calls that name one,
and settings deny reading them. `.env.example` is fine. Tests build such names at runtime, and the
setup script writes the API key without printing it.

## Hooks

- **PreToolUse `block-env.py`** blocks any access to `.env` files.
- **PostToolUse `post-edit.ts`** formats the file you just wrote, then lints it and checks its
  comment style. Findings come back as context. It never blocks.

## Conventions

- **Language.** Reply in the language the user writes in. Code, comments, commits, pull requests
  and docs are in English.
- **Comments.** Use `/** */` for a file or a declaration and `/* */` for other notes. Never `//`
  (Rule 54).
- **Names.** Files are kebab-case. Tools are `<name>.tool.ts`, services `<domain>.service.ts`,
  formatters `<domain>.format.ts`, and type-only files `*.types.ts`.
- **Commits.** `type: description` (`feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`),
  ending with the attribution trailer.
- **Branches.** `internal/<scope>`. Open a pull request, wait for the **Self Test** check, and merge
  with a merge commit.
- **Versioning.** Bump `package.json` and update `CHANGELOG.md` as in
  [RELEASING.md](RELEASING.md). `bun run check:version` verifies both.
- **Package manager.** Bun (`bun install`, `bun add`). The Node fallback exists for the locked-down
  Windows laptop only.

## Context loading

| Task                                  | Load                                                                              |
| ------------------------------------- | --------------------------------------------------------------------------------- |
| Any code change                       | `.claude/rules/architecture/hexagonal.md`, `.claude/rules/common/folder-shape.md` |
| A tool's input, output or description | `.claude/rules/mcp/tool-design.md`                                                |
| Paths, git, secrets, auth             | `.claude/rules/security/read-only.md`                                             |
| Tests and coverage                    | `.claude/rules/typescript/coverage.md`                                            |
| Lint config                           | `.claude/docs/lint-config.md`                                                     |
| Something that broke before           | `.claude/anti-patterns/INDEX.md`                                                  |
