# Plan 003 fixture commands

Run shared/backend ci and build first. From repository root:

- `FIXTURE_PHASE=sqlite npm --prefix dbstats/app/backend run test:integration`: writable control preserves DB/WAL hashes and mtimes, permits only SHM offsets 100–119 (SQLite read marks); reads the actual fixture table and rejects INSERT. Writer stays open and idle through snapshots.
- `FIXTURE_PHASE=sqlite FIXTURE_STRICT_WRITABLE=1 npm --prefix dbstats/app/backend run test:integration`: original strict three-file diagnostic. Expected failure on writable fixtures when reader bookkeeping changes SHM. This is not mounted-readonly acceptance.
- `FIXTURE_PHASE=http npm --prefix dbstats/app/backend run test:integration`: independently runs actual API, Swagger, root/nested unknown, query, malformed POST, middleware logs and shutdown. Host lacks the final image static assets; root is expected 404 here. Static serving belongs to image ingress acceptance.
- `node dbstats/app/backend/test/fixture-targets.cjs`: synthetic arbitrary/production URL rejection before opening any connection.
- `node scripts/test-databases.cjs`: creates named disposable Podman MariaDB/PostgreSQL containers with loopback ports and temporary container storage, checks connection/read, BIGINT/decimal/date and missing-table errors, removes created containers/volumes. Explicit fixture credentials are public disposable values, never operator credentials. Existing named containers cause failure and are not removed.
- `sh scripts/test-image.sh <image>`: bounded direct Podman checks exact Node/native versions, actual table read with readonly bind of DB/WAL/SHM, EROFS on each file, INSERT rejection, full hashes/mtimes; inventory and entrypoint/backend/ingress checks. Needs backend sqlite3 installed on host. Run separately for amd64/aarch64 artifacts. Full s6/nginx initialization needs Supervisor API configuration; standalone initialization failure must be reported, never counted as ingress success.

No immutable mode is used. The old-image probe in runtime-bridge-wal-probe.cjs remains diagnostic only. No plan004 config/YAML refactor is included.

For an intermediate builder-only native diagnostic, set `FIXTURE_IMAGE_NATIVE_ONLY=1 FIXTURE_IMAGE_SQLITE_MODULE=/build/backend/node_modules/sqlite3` when invoking test-image.sh with the builder image ID. The output explicitly excludes final image, entrypoint and ingress acceptance. This subset retains every mounted-readonly data assertion.

Plan 004 gateway extension: after building the backend, `node scripts/test-databases.cjs`
now also runs the native SQLite gateway probe and starts a third named disposable
container, `dbstats-plan004-mysql-fixture` (MySQL 8.4, loopback port 33307).
MariaDB 11.8, MySQL and PostgreSQL use actual recursive/cross-product or
`generate_series` aggregate work. Tests require native timeout codes, healthy next
queries, two concurrent sessions, forced pool replacement, no active orphan query,
and idle pool resource recovery. The SQLite probe repeats real native interruption,
queues an unrelated healthy read, cancels with AbortSignal, rejects writes and
checks the fixture hash. Each child has a finite harness timeout. The allowlist
accepts only these exact disposable endpoints and rejects arbitrary targets.

The gateway validates `DB_QUERY_TIMEOUT` (default 180000 ms),
`DB_ACQUISITION_TIMEOUT` and `DB_QUEUE_TIMEOUT` (each default 5000 ms),
`DB_QUERY_CONCURRENCY` (default 4, maximum 32) and `DB_QUERY_MAX_PENDING`
(default 32, maximum 1024). Durations must be positive integer milliseconds no
greater than 180000. SQLite concurrency is always one because native interruption
is connection-wide. All application database queries must use the singleton
gateway; repositories are used only to construct SQL. Acquisition expiry returns
a safe timeout while retaining capacity until the driver's pending acquisition
settles and its runner is released. Native driver connection establishment has
its own finite timeout. Server cancellation on consumer abort waits for the server
statement deadline; SQLite abort interrupts immediately. Services currently do not
forward individual consumer aborts, so one cached-query consumer cannot cancel
another consumer's work. HTTP/browser/proxy alignment and transport-option mapping
are separate integration gates.
