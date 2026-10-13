## What and why

<!-- The problem this solves, then what changed. Link the issue: Fixes #123. -->

## Checklist

- [ ] **Gates** pass locally: `bash scripts/check/gates.sh`. The pre-commit hook ran them on the
      staged files.
- [ ] **Tests** prove the change, including the case that must fail (a refused path, a bad
      argument), and every touched file stays at 100% lines and functions.
- [ ] **CHANGELOG.md** has an entry under `## [Unreleased]` when users will notice the change,
      with a **Breaking:** line if they must act. A release bumps `package.json`
      ([RELEASING.md](../RELEASING.md)).
- [ ] **Measured**, when ranking, budgets, formats or extractors changed: `bun run eval` before
      and after (and `bun run bench` when speed may change), with the result below.
- [ ] **Docs**: `README.md` and `README.id.md` changed together; `docs/tools.md` matches any tool
      change.
- [ ] **Read-only**: no new write path, no shell, no new program started, and every new path goes
      through `resolveFile`.
- [ ] **No private data**: no real repo names, hostnames, tokens or company code in fixtures,
      scenarios or docs.

## How to check it

<!-- Commands a reviewer can paste, and what they should print. -->

## Eval and benchmark

<!-- bun run eval: the summary table before and after, when it applies. -->
