# Aggregate investigation (independent plan005 stage)

No service SQL is changed. Exact all-history counts still inspect qualifying
entries; LIMIT limits chart output, not aggregate work. No production speedup
is established. Candidate SQL is experiment-only and rejected for adoption
pending representative MariaDB evidence.

## Disposable commands

`npm run test:aggregates` starts its own `dbstats-plan005-aggregate-owned`
MariaDB 11.8 container on 127.0.0.1:33505 with database
`dbstats_plan005_fixture`, waits for readiness, and removes only that container
in finally. An existing name is rejected without reuse/deletion. The exact target
allowlist is checked before connections. Commands and children have deadlines.
The fixture-only account is disposable; no recorder credentials are read.

Service assertions use real TypeORM DataSource/repositories and QueryGateway,
including countEventTypes without modifying event.service.ts. Original and
candidate SQL also execute through the gateway. A native MariaDB timeout
(errno 1969) must be followed by a healthy query. Diagnostics capture a running
fixture query and handle finished/closed sessions. The shared test:integration
runner is preserved; aggregate tests remain a separate focused command because
their owned Docker lifecycle is a distinct prerequisite.

`npm run bench:aggregates -- --baseline baseline --candidate candidate --output /tmp/aggregate-benchmark.json`
recreates the small fixture, records server version, schema, actual index column
order, distributions, JSON EXPLAINs and five timings per variant. It exits nonzero
on mismatched results or candidate median regression greater than 5%. Baseline
and candidate are named built-in variants, never arbitrary SQL files. Warm cache,
fixed baseline-first order and client wall time are documented limitations.
`--rows 100000` grows states synthetically (maximum one million), preserving the
edge cases. Neither size is representative of 60 million production rows.
A limit of two exercises tied boundary membership for every aggregate, including
nullable-name counts and equal attribute sizes. Comparison sorts only returned
rows; it never substitutes different top-N members. A mismatch fails the command.
Routine benchmark and diagnostic artifacts default to temporary files.

The checked-in fixture-benchmark artifact is a disposable smoke measurement,
not adoption evidence. No covering index experiment is warranted by it. No
production indexes, hints, sampling, retention or time windows are introduced.

## Read-only operator runbook

No production connection or probe is requested for this stage. If independently
authorized later, use an existing secured MariaDB client connection. Do not put
credentials in command arguments or captured files. First inspect
`SHOW FULL PROCESSLIST` locally, identify only the intended aggregate connection,
and do not save other sessions' SQL, users, hosts or database names. Then run
`SHOW EXPLAIN FORMAT=JSON FOR <validated-positive-integer-id>` (equivalently
`EXPLAIN FORMAT=JSON FOR CONNECTION <id>`), or
`SHOW ANALYZE FORMAT=JSON FOR <id>` on MariaDB 11.8. These observe existing work.
Do not run `ANALYZE FORMAT=JSON SELECT ...` casually: that executes another query.
A finished/unexplainable thread is an expected race, not evidence of a plan.
Retain only relevant optimizer structure; redact literals/conditions and names
before sharing plans, which can themselves contain sensitive expressions.

Capture logical indexes with TABLE_NAME, INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX,
NON_UNIQUE from information_schema.STATISTICS filtered to the intended schema,
ordered by TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX. Capture MAX(schema_version) from
schema_changes. Source definitions establish expectations, not live migration
success or optimizer key choice. The executable diagnostic command is intentionally
fixture-only: `node test/aggregates/diagnose.cjs <thread-id> <output.json>`.

## Schema contract and remaining gates

Expected selected HA indexes are pinned to HA 2026.11.1, commit
`d8a0dc698c8946b44e455d904000db563cfbf1ba`, recorder schema 53, as supplied in
plan005. `schema.cjs` is a minimal aggregate fixture, not a full recorder clone.
Recheck it for each supported HA release. States metadata/time order is corrected
in the TypeORM annotation; synchronization remains false and automatic migrations
are not enabled. Migration 40's redundant metadata-only indexes are not recreated.

Attributes retain MariaDB byte LENGTH, shared-payload-per-entity deduplication,
null-name merging, orphan exclusion, >0.01 MiB filtering and two-decimal rounding.
PostgreSQL/SQLite SQL is unchanged; their Unicode metric correction belongs to 006.

Deferred: aggregate-specific multi-driver semantic checks (production SQL unchanged),
representative sanitized fixture distributions and MariaDB runtime rows/loops,
alternating/cache-controlled timings, and storage/I/O/recorder-write measurements
if a disposable covering-index experiment becomes justified. No fake cancellation.
