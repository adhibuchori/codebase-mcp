# Releasing

How a version of codebase-mcp ships. `package.json` holds the one version number. The MCP
`serverInfo`, the start banner and `bun run doctor` all read it from there.

## Choose the number

[Semantic Versioning](https://semver.org):

| Bump      | When                                                                                                                                                        |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Major** | A tool or an argument is removed or renamed, a default changes what an answer contains, a new config field becomes required, or the minimum runtime goes up |
| **Minor** | A new tool, argument, mode, language pack, framework extractor, check or command                                                                            |
| **Patch** | A fix, a ranking or format tweak that keeps every argument, or docs                                                                                         |

## During development

Every pull request that changes what users run (`src/`, `assets/`, runtime dependencies) adds a
line under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md), in Keep a Changelog groups (Added,
Changed, Fixed, Removed, Security). A change a user has to act on starts with **Breaking:**. CI runs
`bun run check:version -- --base origin/main`, which fails a runtime change without a changelog
line.

## Cut a release

1. On a branch `internal/release-X.Y.Z`:
   - set `version` in `package.json`;
   - move the `[Unreleased]` entries into a new `## [X.Y.Z] - YYYY-MM-DD` section;
   - add the compare link at the bottom.
2. Run the gates and the measurements:

   ```bash
   bash scripts/check/gates.sh
   bun run check:version
   bun run eval
   bun run bench -- --corpus ~/codebase-mcp-corpus --copies 50   # when search or indexing changed
   ```

   Update [docs/benchmarks.md](docs/benchmarks.md) when the numbers moved.

3. Open a pull request titled `chore: release vX.Y.Z`, wait for **Self Test**, and merge it with a
   merge commit.
4. Tag the merge commit and publish the release:

   ```bash
   git switch main && git pull
   git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z
   gh release create vX.Y.Z --title "vX.Y.Z" --notes-file <(awk '/^## \[X.Y.Z\]/{f=1;next} /^## \[/{f=0} f' CHANGELOG.md)
   ```

5. On every machine that runs the server, update and restart it:

   ```bash
   git pull
   bun install
   bun start
   ```

   A shard whose schema changed rebuilds itself.

Tags never move. A mistake in a release is fixed by a new patch release.

## GitHub settings

The repository is public, and every setting below is set and free for a public repository. If it
ever goes private again, rulesets, secret scanning and the two security workflows need a paid plan.
The pre-commit hook and CI still guard the same things without them.

- A ruleset on `main`:
  - block force pushes and deletion;
  - require a pull request, merged with a merge commit;
  - require the **Self Test** status check from GitHub Actions;
  - no bypass, not even for admins.
- A tag ruleset on `v*` that blocks updates, force pushes and deletion.
- Immutable releases.
- Merge commits only, and delete the branch on merge.
- Actions:
  - workflow permissions are read-only;
  - no workflow may approve pull requests;
  - every action must be pinned to a full commit SHA.
- Secret scanning with **push protection**.
- **Private vulnerability reporting.** The advisory link in [SECURITY.md](SECURITY.md) depends on it.
- **Dependabot alerts**, which also turn on the dependency graph that the dependency-review workflow
  needs.

The CodeQL and dependency-review workflows run on every pull request in a public repository. In a
private one they run only when GitHub Code Security is available and the repository variable
`CODE_SECURITY` is `true`.
