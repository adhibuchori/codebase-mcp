---
paths:
  - '.oxlintrc.json'
  - 'package.json'
---

# oxlint does not read .oxlintignore

**Symptom.** Lint reports findings in files that `.oxlintignore` lists, such as the vendored checks
under `scripts/check/*.mjs`. Or, worse, the ignore file looks like it works because nothing in its
paths has failed yet.

**Cause.** oxlint's default ignore file is `.eslintignore`. A `.oxlintignore` is read only when it is
passed with `--ignore-path`. A config file that nothing reads is a check that matches nothing (see
`a-check-that-matches-nothing-passes.md`).

**Fix.** Keep lint ignores in `ignorePatterns` inside `.oxlintrc.json`, next to the rules they
relax. There is no `.oxlintignore` in this repo.

**Signal it is back.** A `.oxlintignore` file appears, or `oxlint` runs with no `ignorePatterns`.
