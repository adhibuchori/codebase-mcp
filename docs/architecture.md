# Architecture

codebase-mcp is a search engine over local repositories with an MCP front door. This page explains
how a request flows, how the index stays fresh, and why the code is shaped the way it is. The
numbered rules that keep it that way are in [AGENTS.md](../AGENTS.md).

## A request, start to finish

```
ClickUp ──HTTPS──▶ tunnel ──▶ 127.0.0.1:8787
                                  │
   src/app.ts (Hono): request id → secure headers → request log → /health
                      /mcp: body limit (1 MB) → rate limit → API key → mcp.routes.ts
                                  │
   src/http/mcp: parse JSON-RPC → normalise Accept → SDK Web-standard transport (stateless, JSON)
                                  │
   src/tools/registry/define-tool.ts: validate args (zod) → run → redact secrets → budget → log
                                  │
   src/tools/<domain>/<name>.tool.ts → <domain>.service.ts → <domain>.format.ts
                                  │
   src/engine: query planner, symbols, catalog, stack traces, log sources, endpoints
                                  │                         (talks to ports only)
   src/adapters: ripgrep · JS scanner · SQLite shards · tree-sitter · git · file system
```

The transport is stateless: every POST builds a fresh MCP server around the shared runtime. That
costs well under a millisecond, and no session can leak between clients.

## Layers

| Layer          | Folder                                                         | Holds                                                                                                                          | May import                                   |
| -------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| Domain         | `src/core/`                                                    | Ranking, budgets, cursors, query trigrams, path rules, redaction, stack-frame paths, log masking, route matching, symbol trees | Other `core/` only                           |
| Language packs | `src/languages/`                                               | One folder per language: extensions, grammar id, symbol patterns, route and client extractors, stack parser                    | `core/`                                      |
| Ports          | `src/ports/`                                                   | Interfaces: file system, search, index, git, logger, clock, registries                                                         | Types from `core/`                           |
| Engine         | `src/engine/`                                                  | Application services built on ports                                                                                            | `core/`, `ports/`                            |
| Tools          | `src/tools/`                                                   | The nine MCP tools                                                                                                             | `core/`, `engine/`, `ports/`                 |
| Adapters       | `src/adapters/`                                                | ripgrep, the JS scanner, SQLite, tree-sitter, git, Bun or Node runtime                                                         | `core/`, `ports/`                            |
| Indexer        | `src/indexer/`                                                 | Inventory, per-file analysis, shard writing, job queue, worker threads                                                         | `core/`, `ports/`, `adapters/`, `languages/` |
| HTTP           | `src/http/`                                                    | Hono middlewares and the MCP transport                                                                                         | `core/`, `ports/`                            |
| Composition    | `src/composition/`, `src/app.ts`, `src/index.ts`, `src/env.ts` | Picks the adapters and wires everything                                                                                        | everything                                   |

oxlint enforces each "may import" column with `no-restricted-imports` overrides. `Bun.*` is allowed
only in `src/adapters/runtime/` and `src/adapters/index/sqlite.ts`, so the same code runs on
Node.js 22.18+. Only `src/env.ts` reads `process.env`.

### Why hexagonal, and not the be-hono template as is

The be-hono template is shaped for CRUD APIs over a database. This project is different:

- **Every capability has two or more backends.** Text search runs on ripgrep or a JavaScript
  scanner. SQLite runs on `bun:sqlite` or `node:sqlite`. The server runs on `Bun.serve` or
  `@hono/node-server`.
- **It must support many languages without touching the core.**

Ports give the engine one interface per capability, and the composition root picks the
implementation at start. Everything else from be-hono stays:

- thin handlers;
- services that receive their dependencies;
- one-way imports;
- 200-line files;
- no `any`;
- 100% coverage.

### Why TypeScript

Go or Rust would be faster per line of code. But the heavy work is already native: ripgrep is
Rust, SQLite is C, and the parsers are tree-sitter WASM. TypeScript also suits the constraints:

- It is the only option that runs unchanged on a locked-down Windows laptop where only Node is
  allowed.
- It has the reference MCP SDK, which gets new protocol versions first.
- It matches the rules in agent-config-kit.

### Why Hono

|                                                                        | Hono     | Express  | Fastify | NestJS   | Elysia       | `Bun.serve` alone |
| ---------------------------------------------------------------------- | -------- | -------- | ------- | -------- | ------------ | ----------------- |
| Runs on Bun and Node                                                   | ✅       | ✅       | ✅      | ✅       | ⚠️ Bun-first | ❌ Bun only       |
| Web-standard `Request`/`Response` (what the MCP SDK's transport takes) | ✅       | ❌       | ❌      | ❌       | ✅           | ✅                |
| Size and startup                                                       | tiny     | small    | small   | heavy    | small        | none              |
| Middleware (request id, secure headers, body limit)                    | built in | packages | plugins | built in | plugins      | write your own    |
| Used by the MCP SDK itself                                             | ✅       |          |         |          |              |                   |

## Search at scale

1. **Discovery.** `roots` in the config are walked level by level, up to `maxDepth`, to find git
   repos. Each repo gets a unique slug and a group, which is the first folder below the root.
2. **Inventory.** For a git repo this is `git ls-files --cached --others --exclude-standard`, so
   `.gitignore` is respected; any other folder is walked. Sensitive names and excluded globs are
   dropped here, before anything is read.
3. **Shards.** Each repo has one SQLite file in `.cache/index/` with:
   - a contentless FTS5 trigram table (`detail=none`, about 21% of the source size);
   - the files with their language, line count, flags and fingerprint;
   - the symbols, with their own FTS5 trigram table for substring lookups;
   - the routes.

   A shard can be rebuilt on its own.

4. **Workers.** Indexing runs in `node:worker_threads`, up to four at a time, so the server never
   waits for it. A file is re-read only when its size or mtime changed. Index jobs run in
   batches of 200 files per transaction.
5. **Freshness.** Every 30 seconds the coordinator fingerprints each repo's git state with a few
   `stat` calls: HEAD, the git index, the branch ref and packed refs. A repo whose state changed
   is queued, and every repo is rescanned every 10 minutes for edits git hasn't seen.
6. **The planner** (`src/engine/text-search.ts`):
   - A broad search (more than three repos), or any search when ripgrep is missing, asks each ready
     shard for candidate files. The literals in the query (for a regex, the ones it requires) are
     turned into ANDed trigrams.
   - ripgrep (or the JS scanner) then reads only those files.
   - A focused search, a repo without a ready shard, or a pattern without a three-character
     literal is scanned directly.
   - Every match is read from the file on disk, so the index can only narrow, never invent.
7. **Ranking and grouping** (`src/core/rank/`) are Zoekt-style; see [tools.md](tools.md).

## Symbols

`src/adapters/parse/tree-sitter-parser.ts` loads the WASM grammar and the `tags.scm` query for a
pack, both vendored in `assets/`. It turns the captures into definitions with ranges, containers
(`Class.method`) and one-line signatures.

The parser falls back to the pack's regex patterns when:

- the grammar is missing or fails to load (Dart);
- the language has no grammar (Swift);
- the file is larger than 512 KB, or minified.

Grammar versions are pinned in `scripts/grammars/grammars.ts`, and `bun run grammars:sync`
refreshes them along with their checksums.

## Debugging tools

- **Stack traces.** Each pack's parser turns its runtime's frames into `{file, line, func,
  pathHint}`, and the parser that recognises the most frames wins. Library frames are recognised
  by path (`node_modules`, `site-packages`, `go/pkg/mod`, …) or by function prefix (`java.`,
  `org.springframework.`, `runtime.`, …). Application frames resolve through the shard's file-name
  lookup by the longest path suffix.
- **Log lines.** The prefix is stripped and variable parts are masked. The longest constant
  fragments, plus one per wrapped-error layer, are searched literally. A pack's `logCall` pattern,
  or a configured logger name, marks the statement that writes the message.
- **Endpoints.** Extractors run at index time and store `{kind, role, method, pattern, line,
  framework}`. The lookup normalises both sides: `/orders/123` matches `{id}`, `:id` and `<id>`,
  and a concrete segment beats a parameter. Topics match exactly, by part, or through a
  `${placeholder}` prefix.

## Security

The threat model and the rules are in
[`.claude/rules/security/read-only.md`](../.claude/rules/security/read-only.md). Every user path
goes through `normalizeRelative` and `resolveFile`, which re-checks the real path after symlinks.
Secrets are filtered three times:

1. out of the inventory;
2. out of ripgrep, through exclusion globs;
3. out of every answer, through `redactSecrets`.
