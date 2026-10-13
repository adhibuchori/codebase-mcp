# Contributing

Thanks for improving codebase-mcp. This page covers the workflow; the rules themselves are in
[AGENTS.md](AGENTS.md) and the design in [docs/architecture.md](docs/architecture.md).

## Set up

```bash
bun install          # also installs the husky pre-commit hook
bun run setup        # point it at a folder with a few repos
bun test             # about 4 seconds
```

You need Bun 1.3.12+ and git. ripgrep, SQLite and the grammars come with `bun install`. gitleaks is
optional locally (`brew install gitleaks`); CI always runs it.

## Workflow

1. Branch from `main` as `internal/<scope>`, e.g. `internal/kotlin-routes`.
2. Make the change, with tests beside the code in `__tests__/`.
3. Run the gates. The pre-commit hook runs them on staged files too:

   ```bash
   bash scripts/check/gates.sh
   ```

4. Commit as `type: description`:
   - `feat:` new behaviour
   - `fix:` a bug
   - `refactor:` the same behaviour
   - `test:`, `docs:`, `ci:` or `chore:` for everything else
5. Add a line under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md) when users will notice the
   change.
6. Open a pull request. The template asks for the eval result when ranking, budgets, formats or
   extractors changed. CI must pass **Self Test**, and the pull request is merged with a merge
   commit.

## What the gates check

| Gate               | Command                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| Format             | `bun run format:check` (oxfmt)                                                                               |
| Lint, type-aware   | `bun run lint` (oxlint): 200-line files, 40-line functions, layer boundaries, no `any`, no floating promises |
| Types              | `bun run type-check` (TypeScript 7, strict)                                                                  |
| Tests and coverage | `bun run test:coverage`: 100% of lines and functions in every file                                           |
| Coverage policy    | `bun run check:coverage-policy`: every exemption explained                                                   |
| Comment style      | `bun run check:comments`: `/** */` and `/* */` only                                                          |
| Dead code          | `bun run check:dead-code` (knip)                                                                             |
| Folder shape       | `bun run check:folder-shape`: a folder holds files or folders, and tests mirror sources                      |
| Module mocks       | `bun run check:mocks`: no `mock.module` in test files                                                        |
| Double assertion   | `bash scripts/check/double-assertion.sh`                                                                     |
| Secrets            | `bash scripts/check/secrets.sh` (gitleaks)                                                                   |
| README pair        | `node scripts/check/readme-pair.mjs --staged`: `README.md` and `README.id.md` change together                |
| Version            | `bun run check:version`: `package.json` and `CHANGELOG.md` agree                                             |

## Adding a language, a framework or a tool

- **A language** is a folder under `src/languages/` plus one line in the registry. See "How to add
  a language" in [AGENTS.md](AGENTS.md).
- **A framework** is a route, client or messaging extractor in the language's folder, with tests
  over real-looking source.
- **A tool** needs a good reason, because every tool costs tokens on every request. See "How to add
  a tool" in [AGENTS.md](AGENTS.md).

## Measuring a change

```bash
bun run eval                                                  # precision and tokens, 20 scenarios
bun run bench -- --corpus ~/codebase-mcp-corpus --copies 50   # speed at 200 repos
```

[docs/benchmarks.md](docs/benchmarks.md) lists the corpus and the last results.
