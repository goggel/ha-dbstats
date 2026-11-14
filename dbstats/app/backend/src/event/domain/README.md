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

PostgreSQL 16 or newer is required for the event-domain chart only, as authorized
2026-11-15. Older PostgreSQL returns HTTP 503 with stable code
DOMAIN_JSON_COMPATIBILITY and a clear unsupported-version message. General
PostgreSQL support and all other charts remain available. MariaDB, MySQL and
SQLite are unaffected. PostgreSQL jsonb validation excludes escaped NUL and lone
surrogates, including those outside the domain, to prevent extraction errors.

Run `npm run test:domain:drivers` after backend build. The runner uses native
application drivers, fixed named disposable containers and localhost ports,
readonly application connections, bounded deadlines and ownership cleanup.
Container errors report only operation, exit status, signal and timeout/code;
command arguments, SQL and connection URIs are never printed.

Reviewer verification passed focused SQLite/MariaDB/MySQL/PostgreSQL 16
assertions, but the full runner exited before PG15 with an opaque fixture
command error. That review did not establish a passing full matrix. Composed
validation is recorded separately after rerunning the complete runner.

Checkpoint B (snapshots/cache) and final image/platform/HA ingress validation
remain separate and are not authorized by this source checkpoint.

Composed source validation (2026-11-15)
---------------------------------------

Base: 13c6fac987cdb819e6ec1f43e372a39e7f6ab6d0 (005), with the five
domain commits through 605cf9fb8b67d39a1fce1030d132d6fc7f125903 composed.
Node v24.22.1; npm ci used existing lockfiles without upgrades.

- Backend `test -- --runInBand`: 7 suites, 66 tests passed.
- Backend `run build`: passed; `run lint:check`: zero errors, 28 warnings.
  The inherited gateway test formatting required only a line wrap.
- Frontend `test -- --runInBand`: 2 suites, 21 tests passed;
  `run build` and `run lint:check`: passed.
- Backend `run test:aggregates`: passed owned MariaDB baseline/candidate
  equivalence, HA index/config checks, and diagnostic lifecycle/allowlist checks.
  Aggregate SQL and tests were preserved.
- `CONTAINER_CONNECTION=podman-machine-default node scripts/test-databases.cjs`:
  exit 0, full named native SQLite/WAL/readonly, HTTP routing/validation,
  MariaDB/PostgreSQL connections, HTTP deadline/following-metric progress,
  and MariaDB/MySQL/PostgreSQL cancellation/replacement/resource assertions.
- Backend `run test:domain:drivers`: exit 0, complete native SQLite,
  MariaDB 11.8, MySQL 8.4, PostgreSQL 16 and PostgreSQL 15 matrix. Checks cover
  100 references, Unicode/adversarial JSON, bounded rows, timeout/recovery,
  empty input, and PG15's explicit version message followed by a successful
  event-type service metric through its real repository and singleton gateway.
- `git diff --check`: passed. Task-created containers removed; no existing
  container was reused or removed. No application image was rebuilt.

Diagnosis: initial reruns reproduced opaque errors; phase diagnostics localized
one to PostgreSQL setup connection acquisition before DDL. Socket-only readiness
can observe the image's temporary initialization server. Readiness now probes
TCP, with bounded setup connection retries before any DDL. The added unaffected
metric assertion also needed real entity metadata; the fixture now supplies it.
After those scoped fixes the entire runner passed. This is executor validation,
not a claim that the reviewer's earlier full runner passed.

Checkpoint A source checks are complete. No cache 006B, query optimization,
image/platform/ingress validation, publication approval, push or deployment is
included. Existing shared integration/005 scripts and dependency locks remain
unchanged.
