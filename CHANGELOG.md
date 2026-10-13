# Changelog

All notable changes to codebase-mcp are listed here. The format follows
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and the project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). A **Breaking:** line marks a change
you have to act on. How a release is made: [RELEASING.md](RELEASING.md).

## [Unreleased]

## [2.0.0] - 2026-10-14

A rewrite for large multi-repo codebases: fast across hundreds of repos, small answers, and tools
built for debugging. Measured on 200 repos (1.8 GB): searches answer in under 0.4 s (p95), and a
typical answer is 100–1,500 tokens. v1 took 4.4 s per search over 27,000 files and up to 39,500
tokens per file read.

### Added

- `bun run setup` finds every git repo under the folders you name and writes `codebase.config.json`
  (with a JSON schema for editor completion), and creates a strong `MCP_API_KEY` in `.env` without
  printing it.
- `bun run doctor` checks:
  - the runtime and the API key;
  - the config and the repos it finds;
  - ripgrep, git, SQLite and the grammars;
  - the running server and the tunnel tool.
- `bun run index` builds every index and exits; `bun run stdio` serves MCP over stdin and stdout
  for Claude Code, Cursor and other local clients.
- A background index per repo (SQLite FTS5 trigram, about 21% of the source size), refreshed
  within 30 seconds of a commit, checkout or pull, and rebuilt per changed file only.
- A query planner: a broad search uses the index to pick candidate files, and ripgrep reads only
  those; a focused search runs ripgrep directly. Results are always read from disk.
- Symbols from tree-sitter grammars for Java, Kotlin, Scala, Go, C#, TypeScript, TSX, JavaScript,
  Python, PHP, Ruby, Rust, C, C++ and Elixir, plus line patterns for any other language.
- Language packs for HTTP routes, HTTP clients, gRPC and message topics in the main frameworks, and
  stack-trace parsers for the JVM, Go, .NET, Node, Python, PHP and Ruby.
- New tools:
  - `repo_overview`: the map of one repo.
  - `find_symbol`: definitions and references.
  - `triage_error`: stack trace, log line, error message or URL, mapped to code.
  - `find_endpoint`: HTTP route, gRPC method or topic, mapped to its handlers and callers.
- `list_repos` now shows each service's languages, frameworks, endpoints, topics, last commit and
  index state, and filters by name, group or language.
- Every answer has a token budget (`limits.maxResponseTokens`, 6,000 by default) and steps down in
  detail before cutting. Long result lists page with a cursor.
- Every answer is scrubbed of token-like values (API keys, JWTs, private keys, credentials in
  URLs).
- Request logs show the JSON-RPC method, the tool, the client's protocol version and name, the
  status and the time taken.
- Runs on Node.js 22.18+ as well as Bun, with no install scripts and nothing to compile, for
  locked-down Windows laptops. When the bundled ripgrep can't run, search falls back to a
  JavaScript scanner.
- `bun run eval` (20 debugging scenarios) and `bun run bench` (a scale benchmark over N copies of a
  corpus).
- Quality gates:
  - format and type-aware lint (oxfmt, oxlint);
  - TypeScript 7 strict;
  - 100% line and function coverage per file;
  - dead code (knip), comment style, folder shape, secrets (gitleaks);
  - the README pair and version sync.

  They run in a pre-commit hook and in CI on macOS, Windows and Ubuntu.

### Changed

- **Breaking:** `project_tree` is replaced by `repo_overview`, `read_file` by `read_code`, and
  `git_info` by `git_history`. Their arguments changed; see [docs/tools.md](docs/tools.md).
- **Breaking:** repos are configured in `codebase.config.json`. Run `bun run setup` once.
  `REPOS` in `.env` still works when there is no config file.
- **Breaking:** Node.js 22.18 or newer is required when running without Bun (v1 accepted 18).
- `search_code` searches every repo at once by default. It ranks definitions and whole-word hits
  first, and tests, generated and vendored files last, and groups hits by file with the enclosing
  function. It has `literal`, `word` and `regex` modes.
- `read_code` reads one function by name (`repo/path#Class.method`). For a large file it shows the
  outline first instead of the whole file.
- The server is TypeScript on Hono and the MCP SDK's Web-standard transport, laid out as core,
  ports, adapters, engine and tools. Express is gone.
- git runs with its system and global config ignored, along with fsmonitor and the pager.
  Revisions are validated, and `--end-of-options` and `--literal-pathspecs` are used.

### Fixed

- A regex that the JavaScript engine would take exponential time on is refused, instead of stalling
  the server.

## [1.0.0] - 2026-10-13

The single-file JavaScript server that ClickUp Brain used first.

### Added

- Six read-only tools: `list_repos`, `project_tree`, `read_file`, `search_code`, `find_files` and
  `git_info`.
- API-key auth (`Authorization: Bearer` or `X-API-Key`, compared in constant time), a per-IP rate
  limit, and blocking of `.env` files and other sensitive names.
- `bun start`, `bun tunnel` (Cloudflare on Mac, Pinggy on Windows) and `bun run check`.

[Unreleased]: https://github.com/adhibuchori/codebase-mcp/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/adhibuchori/codebase-mcp/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/adhibuchori/codebase-mcp/releases/tag/v1.0.0
