---
paths:
  - 'src/**'
---

# Hexagonal layout

`AGENTS.md` §B holds the numbered rules; this file explains the layout they protect. Lint enforces
every import boundary below (`.oxlintrc.json` overrides with `no-restricted-imports`).

| Layer | Folder | May import | Never imports |
| --- | --- | --- | --- |
| Domain | `src/core/` | other `core/` | I/O (`node:fs`, `node:child_process`), `bun:*`, Hono, the MCP SDK, any outer layer |
| Language packs | `src/languages/` | `core/` | the same as `core/`, plus `config/` |
| Ports | `src/ports/` | types from `core/` | anything at runtime (type-only files) |
| Application | `src/engine/` | `core/`, `ports/` | `adapters/`, `tools/`, `http/`, `node:fs`, `node:child_process` |
| Tools | `src/tools/` | `core/`, `engine/`, `ports/`, the MCP SDK (registry only) | `adapters/`, `http/`, `indexer/`, `node:fs` |
| Adapters | `src/adapters/` | `core/`, `ports/`, Node and Bun APIs | `tools/`, `http/`, `engine/` |
| Indexer | `src/indexer/` | `core/`, `ports/`, `adapters/`, `languages/` | `tools/`, `http/`, `engine/` |
| HTTP | `src/http/` | `core/`, `ports/`, Hono, the MCP SDK | — |
| Composition | `src/composition/`, `src/app.ts`, `src/index.ts`, `src/env.ts` | everything | — |

## Why this shape

- **Several backends per capability.** Text search runs on ripgrep or the JavaScript scanner,
  SQLite on `bun:sqlite` or `node:sqlite`, the server on `Bun.serve` or `@hono/node-server`. The
  engine sees one port; the composition root picks the adapter at start.
- **Pure logic is cheap to test.** Ranking, budgets, parsers, route matching and log masking live
  in `core/` and `languages/` and are tested without a file system.
- **A language is a folder.** `src/languages/<id>/pack.ts` (plus its route extractors and stack
  parser) and one line in `src/languages/registry/language-registry.ts`. Nothing else changes.

## A tool, start to finish

`src/tools/<domain>/<name>.tool.ts` declares the input (zod), the description (3–4 sentences and an
example, under 2,048 characters) and a thin `run` (≤ 15 lines, AGENTS.md Rule 28) that calls a
`<domain>.service.ts` and renders through a `<domain>.format.ts`. Register it in
`src/tools/registry/build-server.ts`; `defineTool` adds the read-only annotations, redaction, the
response budget and the error contract.

## Dependency injection

No container. The composition root (`src/composition/create-runtime.ts`) builds the adapters and
hands an `EngineDeps` object down. Tests build the same object around temporary workspaces
(`src/testing/helpers/`), never `mock.module` (see
`.claude/anti-patterns/bun-mock-module-is-process-wide.md`).
