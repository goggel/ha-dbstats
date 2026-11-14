Domain occurrence query (006 checkpoint A)
=========================================

Each event referencing an existing event_data row contributes once. Shared data
is parsed in SQL after grouping event references by data_id. Null and orphan
references and unreferenced payload rows contribute nothing. Only a nonempty,
top-level JSON string domain counts. Case, whitespace and Unicode are retained;
no coercion, trimming or normalization is performed. Malformed JSON, null,
missing domains and nonstrings are ignored. This narrows the original truthy
JavaScript behavior intentionally to string domains.

Results order by count descending, then UTF-8 bytes ascending, including at the
chart limit. Hexadecimal grouping avoids case-insensitive and trailing-space
collation merging. Only the limited aggregate rows cross the Node boundary.
Result size is bounded; database scan time is not bounded by this helper.
The direct repository read is an integration seam for the pending 004 gateway.
No snapshot/cache/admission changes are included.

PostgreSQL uses pg_input_is_valid, requiring PostgreSQL 16 or newer. Older
PostgreSQL compatibility remains a STOP gate: safely validating malformed text
on older versions needs another strategy. Do not claim general PostgreSQL
compatibility or ship this checkpoint until that requirement is resolved.

Run from any directory:

    python3 /absolute/path/to/backend/test/domain/run-engines.py

The standalone runner needs existing backend dependencies, Python SQLite JSON1,
and the rootless podman-machine-default connection. It creates only fixed named
dbstats-domain-006a containers, exposes no host ports, validates the fixture
container/database allowlist before connecting, and removes those containers.
Existing names cause creation to fail, rather than deleting another fixture.
SQLite setup uses a named temporary fixture; query connections use mode=ro.
No TypeORM synchronization or migrations run. No application connection settings
or recorder database are used. Engine assertions exercise shared references
(100 -> 100), invalid/missing/nonstring/null payloads, orphan/null IDs,
unreferenced payloads, Unicode, case/space ties, limit and empty tables.

Verification in isolated checkout (2026-11-14)
-------------------------------------------

- `npm --prefix dbstats/app/backend test -- --runInBand`: 3 suites, 18 tests pass.
- Backend `run build`: pass. `run lint:check`: zero errors, 20 existing warnings.
- `test:integration`: unavailable (script absent at required base).
- Standalone fixture runner: SQLite 3.54.0, MariaDB 11.8.9, MySQL 8.4.13,
  PostgreSQL 16.16 all pass. This verifies actual SQL engines, not the pending
  TypeORM runtime bridge. PostgreSQL before 16 is unverified/unsupported here.
- Native sqlite3 binding unavailable after dependency install with ignore-scripts;
  SQLite SQL was exercised through Python in readonly mode, not the app driver.
- Default rootful Podman probe timed out; rootless connection worked. No other
  executor's fixture containers were accessed or changed.
- No frontend tests/build: checkpoint A changes no frontend. No cache tests:
  checkpoint B is outside scope. Final 003 runtime and 004 gateway/deadline
  integration are pending. This is a STOPPED checkpoint, not full 006 completion.

The service test initially imported real config and failed without /homeassistant;
its fixture now supplies config via Jest mock. Lint then required type-only imports
in that test; corrected. Production dependencies/locks and shared runners remain
unchanged. No production data or schema changes were made.
