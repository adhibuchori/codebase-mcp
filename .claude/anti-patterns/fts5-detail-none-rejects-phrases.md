---
paths:
  - 'src/adapters/index/**'
---

# FTS5 with detail=none rejects phrase queries

**Symptom.** `SQLiteError: fts5: phrase queries are not supported (detail!=full)` from a trigram
query, typically a substring longer than three characters.

**Cause.** The shards use `detail = 'none'` to keep the trigram index near a quarter of the source
size. Without positions, FTS5 cannot match a quoted multi-trigram phrase.

**Fix.** Query with `core/query/trigrams.ts#trigramMatch`: every trigram quoted on its own and ANDed,
which needs no positions. The result is a candidate set; confirm the exact substring afterwards
(`instr(...)` in SQL, or the searcher's verify pass).

**Signal it is back.** A `MATCH ?` bound to a raw user string instead of `trigramMatch(...)`.
