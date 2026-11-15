# Chart query review and bounded output (2026-11-15)

Base ee90af1; preserves PR3 binary-domain/error handling, frontend label copying,
and rc2. No production access, schema change, hints, dependency changes, deadline
increase, version bump, push or deployment. Live engine/version remains unknown.

## Implemented

All eight chart outputs default to at most 20 rows. MAX_ROWS_IN_CHART preserves
positive safe integer values below 20 and clamps larger safe integers to 20.
Missing, zero, negative, fractional, nonnumeric and unsafe integers use 20.
System metadata SQL now includes LIMIT on MySQL/MariaDB and PostgreSQL; SQLite
sorts all table measurements before slicing, so it still computes every table.
Other chart services already use the shared configured bound. Attribute filtering
still happens after LIMIT and can return fewer rows. Ties retain existing arbitrary
membership at the boundary; no deterministic ranking guarantee was added.

The dashboard now explicitly explains estimated table row counts and allocation
sizes. MySQL/MariaDB TABLE_ROWS and PostgreSQL n_live_tup are already estimates;
SQLite table row counts remain exact. No new exact table count is introduced.
LIMIT 20 bounds output and transfer, **not** the full aggregate or its sort input.

## Endpoint → index → observed fixture plan → recommendation

Plans are estimates from actual owned MariaDB 11.8.9 and MySQL 8.4.13, not live
recorder plans or runtime loop measurements. schema.cjs models schema 53's relevant
index column order, not every recorder column/index. Extra fixture adds events
(data_id) and event_data PK with binary payloads. See raw results and extra-plans.

| Service method | Existing relevant index columns | Fixture access and remaining cost | Recommended change |
| --- | --- | --- | --- |
| countStateTypes | states(metadata_id,last_updated_ts); states_meta PK(metadata_id), unique(entity_id) | Both engines use covering metadata/time fact index with ref lookups; label grouping and final count sorting still inspect history | Keep SQL; cap output; inspect actual live plan before rewrite |
| countAttributesSize | states(attributes_id), states(metadata_id,last_updated_ts); metadata PK and entity index; attributes PK | MariaDB repeated case uses attributes index then metadata PK lookups. MySQL can scan states. Neither fact index covers both references. Both variants materialize DISTINCT and aggregate/sort. Distinct payload case changes access paths and payload lookup cost | Keep SQL; early pair dedup candidate helps repeated pairs, but both variants time out on MariaDB distinct fixture; no universal improvement established |
| countEventTypes | events(event_type_id,time_fired_ts); event_types PK | Covering event index scan/ref plus metadata lookups and grouping/sort | Keep SQL; group-before-join candidate has no new repeatable timing evidence here |
| countEventsByDomain | events(data_id); event_data PK(data_id) | Covering events reference scan materializes counts by data_id; scans the two-row payload table then looks up materialized reference counts; validated UTF-8/JSON extraction and binary-domain grouping/sort remain necessary | Keep PR3 SQL; invalid/binary payload semantics prohibit blind JSON rewrites |
| countStatsLong | statistics(metadata_id,start_ts); statistics_meta PK(id), unique(statistic_id) | Covering composite index/ref and metadata lookup, temporary aggregate/final sort | Keep SQL; inspect live cardinalities |
| countStatsShort | statistics_short_term(metadata_id,start_ts); same metadata indexes | Same shape as long statistics | Keep SQL |
| getTableRows | information_schema.TABLES (engine metadata) | Metadata scan/sort, not an application table index issue; TABLE_ROWS is approximate | Add SQL LIMIT 20; label estimates |
| getTableSize | information_schema.TABLES (engine metadata) | Allocation metadata + computed-size sort | Add SQL LIMIT 20; explain allocated space |

Index usage does not imply a cheap query. Covering scans can legitimately read
all qualifying index entries; PK payload lookups, materialized DISTINCT, temporary
grouping and filesort are expected for these metrics. A full scan can also be a
reasonable optimizer choice when most history is needed. Do not create another
index from these fixtures alone: write/storage costs were not measured.
PostgreSQL/SQLite query shapes were source-reviewed; these MySQL-family EXPLAINs
do not establish their optimizer choices. SQLite system size scans dbstat per table;
PostgreSQL rows uses pg_stat_user_tables and size uses pg_total_relation_size.

## Larger repeated lifecycle experiment

`python3 docs/chart-query-evidence/run.py` runs two fresh owned lifecycles per
engine, 300,000 states each, repeated pairs then distinct 128-byte payloads.
Three alternating-order samples per completed variant; native SELECT deadline
8 seconds and client watchdog 15 seconds. Container limits: 1 CPU, 768 MiB,
no exposed ports; unique ownership checked before creation and cleanup in finally.
The first attempted larger run stopped at a native MariaDB timeout, cleaned up,
and was replaced by the recorded run, which records native timeouts explicitly.
No deadline was raised. Two independent full lifecycles are stronger than the
previous 100k single-lifecycle measurements, but still synthetic and warm-cache.

The experiment captures current and group-before-join candidate plans for the
count charts; only attributes receive repeated timings. The main runner grows
states only; `metadata-domain.py` separately grows events and both statistics
facts to 300k and captures their production-shaped plans plus system metadata.
No ANALYZE TABLE or optimizer statistics refresh is performed. Cardinality estimates
can be stale. Raw equality is checked whenever both variants complete. Timeouts
are not assigned fake durations or treated as successful equivalence checks.
Shared/null/orphan/Unicode/threshold behavior is covered by the separate existing
real-driver aggregate suite; the larger distinct fixture replaces some valid
reference edge cases and is not a complete semantic suite. No new rewrite was
adopted, so cross-engine rewrite equivalence is not asserted.

See `chart-query-evidence/results.json` for all timings/plans and native timeouts;
`extra-plans.json` for domain, metadata and larger count fact plans.
Prior evidence commit 3c2d73f and its recorder-performance-research.md remain
background; these measurements are new and do not establish the live 180-second
cause or claim it is fixed.

## Estimates: decision and next useful option

The user's acceptance of estimates supports the existing cheap metadata counts,
now visibly described in the dashboard. There is no database-maintained
per-entity unique shared-attribute byte estimate to query cheaply.

A principled future count estimator could select uniformly seeded primary-key
ID strata over indexed MIN/MAX bounds, read a fixed budget of ID coordinates,
then weight observed entity counts by known inclusion probabilities. Gaps must
count as empty coordinates; replacing them with the next extant row biases the
sample. Fixed seeds allow reproduction; independent seeds provide uncertainty.
Avoid ORDER BY RAND(), first-N global claims, exact COUNT setup, and unbounded
range spans. Retention holes, clustered entities, sparse IDs, null/orphan references,
rare top categories and near ties need measured error/coverage tests. A bounded
sample can return fewer than 20 observed entities and cannot guarantee true top20.
Sample basis, coordinates attempted, rows observed, ID span and uncertainty must
be returned and visible alongside an exact-mode choice.

This estimator **does not estimate the current attribute metric correctly**:
uniform state sampling overrepresents frequently reused attributes, while distinct
sample pairs miss rare pairs with unknown unequal inclusion probability. Multiplying
sampled distinct bytes by an inverse row fraction is invalid. A recent indexed
window could instead show *observed unique attribute bytes within that window*,
with its explicit time/ID coverage and no all-history extrapolation; that changes
the question answered and needs a visible separate mode. No biased sample is
shipped as an all-history estimate. No sampling speed/error evidence was collected
in this change; implementing that mode and claiming estimator accuracy remains
future work for the parent, rather than an implicit metric change here.

## Safe live evidence artifact

`chart-query-evidence/live-read-only.sql` contains metadata and plain EXPLAIN
FORMAT=JSON for all eight production-shaped chart queries. Run manually with an
existing secured client on the intended recorder database after checking version
and schema compatibility. It does not execute those SELECT aggregates. EXPLAIN
can still take metadata locks; retain normal client/server timeouts and cancel
if blocked. Do not use ANALYZE, EXPLAIN ANALYZE, DDL or index/statistics updates.
The attribute query aliases differ from service text but have the same joins,
DISTINCT/grouping/order/limit; actual application SQL remains the authoritative
query if schema compatibility differs. While an authorized chart is already
running, MariaDB SHOW EXPLAIN FORMAT=JSON FOR <id> or MySQL EXPLAIN FORMAT=JSON
FOR CONNECTION <id> can capture its actual chosen plan. Validate the positive
connection ID locally and redact sessions, identifiers and payloads before sharing.
No live-plan claim is possible without that evidence.

## Validation

Node 24.22.1 with locked dependencies; backend Jest 83 tests, lint with zero
warnings, backend build, frontend production build, frontend lint with zero warnings and 22 frontend tests; existing MariaDB aggregate
suite and running/finished diagnostic checks passed. New `node test/chart-limits.cjs`
(from backend, after build), repeated with `7` and `100`, executes every chart
against a real SQLite in-memory fixture with 35 groups and >35 tables, asserting
result lengths and descending numeric order. Defaults and invalid configuration
bounds also have Jest regressions. No lockfile changes.

Attribute medians in ms (lifecycle 1 / lifecycle 2): MariaDB repeated baseline
157.991 / 144.262, candidate 46.595 / 42.360; MySQL repeated baseline
82.301 / 82.676, candidate 41.826 / 42.383. MariaDB distinct: both variants
hit native deadlines in both lifecycles. MySQL distinct baseline 830.027 / 768.701,
candidate 973.732 / 968.408: candidate regresses beyond the existing 5% gate.
This is a concrete reason to retain production SQL despite repeated-pair gains.

The extra-plan runner initially rejected duplicate statistics timestamps during fixture
growth; corrected by advancing timestamps when doubling rows, preserving the
unique (metadata_id,start_ts) index. Failed setup yielded no accepted plans; its
owned container was removed. Both final runners completed and all owned containers
were removed.
