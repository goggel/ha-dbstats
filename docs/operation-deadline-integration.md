# Operation deadline integration evidence

STATUS STOPPED — source integration checkpoints are complete and local gates pass;
full Plan 004 acceptance remains open for final image/platform/real ingress gates.
No publication, production data access, other checkout edits, or agent delegation.

## Checkout and composition

Worktree: `/Users/benjaminkoster/.t3/worktrees/ha-dbstats/t3-593dc931-97251710fd18efc7`
Branch: `t3/enforce-db-operation-deadlines`
Initial base: `9b7ab722f70f5222d77a6b508bab32be8462979f`
Gateway ancestry fast-forwarded to `89144c9050967ecb43664be96fed8915a04c950d`.
Transport `1b4f5c0e2ba3541c5188e73e47918c03db53cb30` cherry-picked as `4e70294`.
Frontend `53c8262a903fd60da4eac24492c3debf232a4c28` cherry-picked as `048ff33`.
The supplied frontend002 concatenation was resolved through the existing branch ref.
No conflicts; Node `^24.22.1` engines retained in manifests and locks.
Implementation checkpoints: `01f73fc` (gateway/operation/diagnostics/fixtures),
`d90a4c6` (frontend/proxy/fixture rendering). This document is a later evidence checkpoint.
005 and 006A candidates were not adopted. Domain payload hydration remains pending.

## Behavior and files

`backend/src/query-gateway.ts`: default expensive concurrency one, validated opt-in
through 32, SQLite always one; monotonic operation context shared across nested calls.
The operation allowance is execution + queue + acquisition (default 190000ms);
combined configuration above 200000ms fails. Queue/acquisition are capped by remaining
operation time, each statement by execution/remaining time, and expired operations
cannot submit more SQL. Native SQLite interrupt and server statement deadlines remain.
`operation.interceptor.ts` establishes context on subscription and adds a stable
controller/handler metricId to safe HTTP errors. `app.module.ts` registers it globally.
SystemService wraps multi-query operations for non-HTTP callers too; nested calls reuse
the context without holding an admission slot for the whole operation.

`typeOrmLogger.ts` omits SQL, parameters and raw driver text in query/error/slow
callbacks, including explicit query logging. Gateway failures expose QUERY_FAILED;
timeouts retain QUERY_TIMEOUT. SQL semantics and read-only SQLite flags are preserved.

Frontend requestQueue rejects invalid explicit 210000..300000ms browser settings,
recognizes server QUERY_TIMEOUT as terminal visible timeout, and preserves queue/retry.
Both nginx timeout settings are 205 seconds, including the parent read timeout.
LOADING.md documents the validated relationship. Nginx values bound inactivity,
while the gateway enforces the actual operation deadline.

Fixtures: query-gateway.spec.ts, safe-diagnostics.spec.ts, operation-http.cjs,
query-deadlines.cjs, sqlite-interrupt.cjs, loading.test.tsx, requestQueue.test.ts,
scripts/test-databases.cjs and scripts/test-nginx-render.cjs.

## Final passing gates (Node 24.22.1)

- Backend Jest: 5 suites, 58 tests; config/include/secrets/transport/gateway/canaries.
- Backend build: pass. lint:check: pass, 0 errors / 32 warnings.
- Frontend Jest: 2 suites, 21 tests; server timeout, retained successful charts,
  queue progress, retry, invalid configuration and existing lifecycle tests.
- Frontend production build: pass (existing Browserslist/deprecation notices).
- `node scripts/test-databases.cjs`: pass. Native SQLite interruption, aborted SQL,
  healthy following query, rejected write and unchanged DB hash; HTTP accumulated
  table-loop timeout and following metric; SQLite WAL/read-only contract; HTTP
  prefix/validation/shutdown; MariaDB 11.8, Oracle MySQL 8.4 and PostgreSQL real
  native timeout codes, two sessions, session replacement, no orphan queries,
  healthy next queries and restored pool baseline. MariaDB HTTP metric timeout
  also returns stable metricId and is followed by healthy metric/no active SQL.
- `node dbstats/app/backend/test/transport/run.cjs`: pass; actual trusted TLS,
  wrong/untrusted CA rejection, plaintext rejection, required TLS rejection on
  non-TLS server and actual Unix socket selection. Known fixture packet sequence
  warnings remain as documented by the approved transport checkpoint.
- `node scripts/test-nginx-render.cjs`: pass. Disposable base-nodejs:0.2.5 fixture
  installs nginx 1.24.0, supplies fixture bashio supervisor functions, sources the
  actual cont-init nginx.sh, checks no placeholders remain, then runs nginx -t.
  Existing duplicate text/html MIME warning; syntax/config test succeeds.
- `git diff --check`: pass.

## Failed attempts and limits

- Initial native cancellation run failed because queue wait consumed the execution
  allowance. Corrected whole-operation allowance to include validated grace;
  final full native/SQL harness passes without weakening cancellation assertions.
  The read-only gate now checks both safe gateway failure and native SQLITE_READONLY.
- Initial HTTP fixture imported configuration before installing its disposable URL;
  corrected import ordering. Next attempt exposed repeated wrapping of SQLite's
  singleton QueryRunner; fixed fixture wrapping with WeakSet, then passed.
- Initial lint found curly/import-type errors; corrected, final lint passes.
- Initial prettier invocation used wrong working directory; reran with correct paths.
- Two nginx fixture setup attempts requested nonexistent Alpine module packages;
  reassessed: nginx itself includes the required sub_filter support. Installing only
  nginx renders and validates the real configuration successfully. No template
  directives or assertions were removed to achieve the pass.

Skipped/open: final add-on image build, supported-platform matrix, final-image
read-only mount gate, live Home Assistant ingress/browser gate. Prior reported image
build timeouts do not establish these gates; they were not rerun here. Controlled
nginx fixture uses an older available base and fixture supervisor values, so it is
not a final-image/platform claim. Chart rendering tests use fixture HTTP responses;
actual MariaDB HTTP/no-orphan behavior is verified separately, not through a live
browser against Home Assistant. No production refresh was performed.
