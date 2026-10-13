# Benchmarks and eval

Two measurements guard every change to search, ranking, budgets or formats:

- **The eval** checks precision and answer size on debugging tasks.
- **The scale benchmark** checks speed and index size as the number of repos grows.

Both run through the real tools: the MCP transport, argument validation, the engine and the
formatter.

## Eval: does the answer point at the right code?

`bun run eval` builds a git workspace from the six fixture services in `tests/fixtures/repos/`
(Java, Go, Node, Python, .NET, proto) and runs the 20 scenarios in
`tests/fixtures/eval/fixture-scenarios.json`. Each scenario names a tool call and the file (and
line, ±3) a good answer must reach within its first _k_ references.

| Scenarios | hit@1 | hit@k | Mean tokens per answer | p50 ms | p95 ms |
| --------- | ----- | ----- | ---------------------- | ------ | ------ |
| 20        | 85%   | 100%  | 131                    | 1      | 18     |

Measured 2026-10-14, version 2.0.0, Bun 1.3.12, Apple M5.

| Kind of task                                                              | Scenarios | Example                                              |
| ------------------------------------------------------------------------- | --------- | ---------------------------------------------------- |
| Error message to the line that throws it                                  | 2         | `search_code "Order already cancelled"`              |
| Identifier, definition, references, file name                             | 6         | `find_symbol "OrderService"`                         |
| Stack trace to frame (JVM, Python, Node)                                  | 3         | `triage_error` with a pasted trace                   |
| Log line to the statement (Java, Go wrapped errors, Python logger prefix) | 3         | `triage_error "ERROR app.consumer Failed to send …"` |
| Route, caller, topic, gRPC method                                         | 5         | `find_endpoint "POST /api/orders/42/cancel"`         |
| Failing URL                                                               | 1         | `triage_error "POST /api/orders/42/cancel"`          |

The three tasks that miss at rank 1 are found at rank 2:

- **Two failing routes.** Both the Node gateway and the Java service behind it serve the same
  route, and both are listed, in name order.
- **One caller lookup.** The expected caller is listed after the route's handler.

Your own scenarios, against your own repos, go in a gitignored `*.private.json` file:

```bash
bun run eval my-team.private.json --config codebase.config.json --out result.md
```

## Scale: how fast with hundreds of repos?

`bun run bench -- --corpus <dir> --copies N` registers every repo under `<dir>` N times under
different names. Each copy gets its own index shard and its own row in `list_repos`, so a few real
repos stand in for hundreds. It reports the index build, then the latency (5 runs each) and the
answer size of nine typical calls across every repo at once.

**Corpus:** four public microservice codebases, shallow clones:

| Repo                                                                                                                  | Commit    | Files |
| --------------------------------------------------------------------------------------------------------------------- | --------- | ----- |
| [dotnet/eShop](https://github.com/dotnet/eShop)                                                                       | `dc7ea49` | 1,145 |
| [GoogleCloudPlatform/microservices-demo](https://github.com/GoogleCloudPlatform/microservices-demo)                   | `38e7348` | 364   |
| [open-telemetry/opentelemetry-demo](https://github.com/open-telemetry/opentelemetry-demo)                             | `f5eafe2` | 604   |
| [spring-petclinic/spring-petclinic-microservices](https://github.com/spring-petclinic/spring-petclinic-microservices) | `1d76b00` | 200   |

**Machine:** Apple M5, 10 cores, 24 GB, macOS; Bun 1.3.12; bundled ripgrep 15.

### 4 repos (×1)

| Repos | Source | Index | Index/source | Build |
| ----- | ------ | ----- | ------------ | ----- |
| 4     | 36 MB  | 8 MB  | 21%          | 1.1 s |

| Call                                                 | p50 ms | p95 ms | Tokens |
| ---------------------------------------------------- | ------ | ------ | ------ |
| `list_repos` (all)                                   | 1      | 27     | 242    |
| `search_code` rare literal ("failed to place order") | 2      | 4      | 81     |
| `search_code` common literal ("context")             | 11     | 13     | 1,457  |
| `search_code` identifier, word mode ("PlaceOrder")   | 32     | 34     | 907    |
| `search_code` regex (`func \w+Handler`)              | 8      | 20     | 943    |
| `find_symbol` exact ("PlaceOrder")                   | 0      | 1      | 635    |
| `find_symbol` substring ("Checkout")                 | 0      | 0      | 169    |
| `find_files` ("Dockerfile")                          | 1      | 2      | 257    |
| `find_endpoint` topic ("orders")                     | 0      | 1      | 39     |

### 200 repos (×50)

| Repos | Source   | Index  | Index/source | Build  |
| ----- | -------- | ------ | ------------ | ------ |
| 200   | 1,787 MB | 379 MB | 21%          | 33.4 s |

| Call                                | p50 ms | p95 ms | Tokens |
| ----------------------------------- | ------ | ------ | ------ |
| `list_repos` (all)                  | 4      | 826    | 3,446  |
| `search_code` rare literal          | 103    | 372    | 903    |
| `search_code` common literal        | 69     | 82     | 1,423  |
| `search_code` identifier, word mode | 150    | 179    | 1,130  |
| `search_code` regex                 | 159    | 200    | 2,368  |
| `find_symbol` exact                 | 27     | 56     | 1,032  |
| `find_symbol` substring             | 22     | 38     | 702    |
| `find_files`                        | 72     | 76     | 288    |
| `find_endpoint` topic               | 19     | 20     | 39     |

What the numbers say:

- **Search stays under 0.4 s (p95) across 200 repos.** A broad search asks every shard for
  candidate files first, and ripgrep then reads only those. Without the index, the same search
  would read all 1.8 GB.
- **Answers stay small as repos grow.** Every answer is capped by the budget, and ranking decides
  what fills it. Going from 4 to 200 repos made answers at most 2.5× larger, and none came near the
  6,000-token cap.
- **The first `list_repos` is the slow one** (p95 826 ms). It builds 200 catalog cards, and later
  calls are served from the cache until a repo's index changes.
- **Indexing is a one-off.** It took 33 s for 1.8 GB on this machine. After that, a commit or a pull
  re-reads only the files whose size or mtime changed. On Windows, expect slower builds while
  Defender scans each file read.

### Plan targets

| Target (plan, phase 2–3)                     | Result                                                        |
| -------------------------------------------- | ------------------------------------------------------------- |
| ≥ 200 repos                                  | 200                                                           |
| Specific text across all repos, p95 < 500 ms | 372 ms ✅                                                     |
| Scoped regex, p95 < 2 s                      | 200 ms ✅ (all 200 repos, not scoped)                         |
| ≤ 2k tokens per search                       | 903–2,368 ✅ for literal and word; the regex answer was 2,368 |
| Symbol lookup p95 < 50 ms                    | 56 ms ⚠️ slightly over at 200 repos (27 ms p50)               |

## v1 baseline

Measured on the same Mac before the rewrite:

|                             | v1                                     | v2                                                  |
| --------------------------- | -------------------------------------- | --------------------------------------------------- |
| `search_code`, 27,000 files | 4.44 s                                 | 0.08–0.37 s across 200 repos and 1.8 GB             |
| Tokens, one file read       | about 39,500 (`read_file`, whole file) | one function, or a 200-line window, or an outline   |
| Tokens, one search          | about 7,000                            | 81–2,368                                            |
| Tokens, a tree listing      | 11,000–12,000 (`project_tree`)         | `repo_overview`: one screen, wide folders collapsed |

## Reproduce

```bash
git clone --depth 1 https://github.com/dotnet/eShop ~/codebase-mcp-corpus/eShop
git clone --depth 1 https://github.com/GoogleCloudPlatform/microservices-demo ~/codebase-mcp-corpus/microservices-demo
git clone --depth 1 https://github.com/open-telemetry/opentelemetry-demo ~/codebase-mcp-corpus/opentelemetry-demo
git clone --depth 1 https://github.com/spring-petclinic/spring-petclinic-microservices ~/codebase-mcp-corpus/spring-petclinic-microservices

bun run eval
bun run bench -- --corpus ~/codebase-mcp-corpus --copies 1
bun run bench -- --corpus ~/codebase-mcp-corpus --copies 50 --out bench.md
```

The benchmark writes its index into a temporary folder and leaves `.cache/` alone.
