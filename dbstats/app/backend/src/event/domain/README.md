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
The service uses the singleton QueryGateway and one operation context, including
the PostgreSQL capability check. countEventTypes remains unchanged.
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
  TypeORM runtime bridge. PostgreSQL before 16 was unverified in that original run.
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

App-driver integration revision (2026-11-15)
-----------------------------------------

The earlier verification section is historical. The current domain service has
no repository.query or payload hydration fallback. PostgreSQL 16+ validates
jsonb before any cast/extraction. This excludes payloads containing escaped NUL,
lone surrogates (even outside domain), or other values jsonb cannot represent.
Valid escaped Unicode pairs aggregate with their literal Unicode equivalent.
This conservative exclusion prevents extraction errors; it does not convert
actual database query errors to empty success.

Compatibility blocker: existing project docs name PostgreSQL without a minimum
major version. No support-policy narrowing is approved. PostgreSQL 15 supports
JSON extraction only after a potentially throwing text-to-JSON cast; jsonpath
error suppression does not protect that initial cast. PostgreSQL 16 introduced
pg_input_is_valid. No equivalent safe pre-16 expression has been established
within this SQL-only, no-DDL, no-payload-transfer scope. A regex is not a JSON
validator. A stored exception-catching function would require prohibited DDL;
Node parsing all payloads would violate bounded transfer. Thus pre-16 receives
explicit DOMAIN_JSON_COMPATIBILITY (503) before domain SQL, under the same
operation deadline, rather than an opaque missing-function error. This is a
visible unresolved compatibility gate, not a declaration that pre-16 support
has been removed. Checkpoint A remains STOPPED pending a compatible strategy
or an authorized product support decision.

Official references consulted:
- https://www.postgresql.org/docs/15/functions-json.html
- https://www.postgresql.org/docs/16/release-16.html
- https://www.postgresql.org/docs/16/functions-info.html
- https://www.postgresql.org/docs/16/datatype-json.html

Run the focused app-driver fixture after backend build:

    npm --prefix dbstats/app/backend run test:domain:drivers

The runner uses only fixed localhost ports 33618/33684/35616/35615, database
`dbstats_domain_006a`, and containers `dbstats-domain-app-006a-<port>` on rootless
Podman. It accepts no external URLs. Existing names fail creation and are never
removed. Setup writes use separate connections, never ORM synchronization or
migrations. Application connections use SELECT-only MySQL/MariaDB accounts,
PostgreSQL default read-only transactions, and native SQLite OPEN_READONLY with
a live WAL writer. No shared integration runner or dependency graph is changed.
A global 240-second watchdog and 30-second subprocess bounds limit the runner.
Owned containers and temporary SQLite files are removed on completion/failure.

Fixtures cover 100 references -> 100, shared/unreferenced/orphan/null data,
malformed/missing/null/nonstring/empty domains, Unicode/escaped Unicode,
case/space/empty table, deterministic ties and limit, a referenced 1 MiB payload
with aggregate output under 1 KiB, raw number/string driver count types,
execution timeout/recovery, PostgreSQL escaped NUL/lone surrogate rejection,
and an actual PostgreSQL 15 explicit compatibility error. The transfer bound
is rows and tested payload exclusion; individual valid domain string lengths
remain recorder-controlled, not an imposed byte cap.
