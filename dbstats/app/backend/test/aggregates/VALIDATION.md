# Composed harness validation — 2026-11-15

Required base: e87eaaa3f6c7732f1bb06a9f2e37bb6a71aa5d35.
Feature commits 2e135ca and 45198fe were cherry-picked as ea8a86f and
03849bf. The latter conflict was resolved by preserving the shared integration
runner and exposing separate focused aggregate commands. No production service
SQL, event.service.ts, dependency graph, runtime image, or shared notes changed.

Checks in the isolated executor checkout:

- Backend Jest: 5 suites, 58 tests passed.
- Backend build: passed.
- test:aggregates: passed on owned MariaDB 11.8 container; original fixed outputs,
  real TypeORM services and QueryGateway, candidates, empty/null/orphan/Unicode/
  shared-attribute cases, tied limit-two membership, schema53 ordered indexes,
  disabled schema synchronization/automatic migrations, native errno1969 timeout
  and healthy next query, running-plan diagnostic and closed-thread races.
- bench:aggregates with 100000 synthetic states: first completed measurement
  rejected candidates under unchanged 5% gate (exit 1); final rerun after adding
  real gateway checks after fixture growth passed (exit 0). This variability and
  tiny synthetic dataset are not adoption evidence. No candidate adopted.
  Latest artifact: /tmp/plan005-benchmark.json. Routine commands write temporary
  evidence; imported historical JSON artifacts were not rewritten.
- Shared test:integration: native SQLite 3.52.0 WAL/read-only and HTTP passed;
  then failed for missing FIXTURE_MYSQL_URL. PostgreSQL/MySQL shared integration
  not rerun; prior reviewer evidence is not relabeled as this executor's pass.
- lint:check failed on pre-existing query-gateway.spec.ts:24 formatting error;
  32 existing warnings. No unrelated gateway source/test edits made.
- git diff --check passed. Owned MariaDB container removed after every run.

Remaining gates: representative repeated MariaDB performance and runtime plan
measurements; aggregate-specific cross-engine checks if production SQL changes;
full shared named database integration in a provisioned fixture environment;
baseline lint formatting; final image/platform/HA ingress. No live recorder
access, production DDL/indexes/hints, or performance rewrite was attempted.

The focused Docker suite remains separate from the shared integration command
because it owns an additional container lifecycle. No threshold was relaxed.
Initial fixture failures exposed TypeORM's username/user option distinction and
service configuration initialization; corrected locally and verified by real
connections. The fixture has its own disposable account and exact target
allowlist. No production credentials are used.
