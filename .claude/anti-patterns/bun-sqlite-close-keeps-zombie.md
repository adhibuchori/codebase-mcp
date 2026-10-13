---
paths:
  - 'src/adapters/index/**'
---

# bun:sqlite `close()` leaves a zombie connection while a statement lives

**Symptom.** On Windows, deleting or replacing an index shard fails with `EBUSY: resource busy or
locked` after the connection was "closed". It shows up first as tests failing to remove their
temporary folders. On macOS and Linux nothing shows: an open file can be deleted there, so the leak
only costs handles and memory. Each shard refresh after a reindex leaks one connection.

**Cause.** `Database.close()` in bun:sqlite uses `sqlite3_close_v2`. While any prepared statement
is unfinalized, SQLite keeps the connection alive as a zombie, with its file, WAL and shared memory
open. A statement prepared before `close()` still answers queries afterwards. node:sqlite finalizes
every statement when the database closes, so the Node path never had the problem.

**Fix.** The adapter (`src/adapters/index/sqlite.ts`) caches its statements and finalizes every one
before `db.close()`. `src/adapters/index/__tests__/sqlite.test.ts` fails if a closed connection
still answers.

**Signal it is back.** A new statement cache, or `db.prepare`/`db.query` kept outside the
adapter's cache. Or `EBUSY` on a `.sqlite` file in the Windows CI job.
