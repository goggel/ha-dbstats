# Plan 003 fixture commands

Run shared/backend ci and build first. From repository root:

- `FIXTURE_PHASE=sqlite npm --prefix dbstats/app/backend run test:integration`: writable control preserves DB/WAL hashes and mtimes, permits only SHM offsets 100–119 (SQLite read marks); reads the actual fixture table and rejects INSERT. Writer stays open and idle through snapshots.
- `FIXTURE_PHASE=sqlite FIXTURE_STRICT_WRITABLE=1 npm --prefix dbstats/app/backend run test:integration`: original strict three-file diagnostic. Expected failure on writable fixtures when reader bookkeeping changes SHM. This is not mounted-readonly acceptance.
- `FIXTURE_PHASE=http npm --prefix dbstats/app/backend run test:integration`: independently runs actual API, Swagger, root/nested unknown, query, malformed POST, middleware logs and shutdown. Host lacks the final image static assets; root is expected 404 here. Static serving belongs to image ingress acceptance.
- `node dbstats/app/backend/test/fixture-targets.cjs`: synthetic arbitrary/production URL rejection before opening any connection.
- `node scripts/test-databases.cjs`: creates named disposable Podman MariaDB/PostgreSQL containers with loopback ports and temporary container storage, checks connection/read, BIGINT/decimal/date and missing-table errors, removes created containers/volumes. Explicit fixture credentials are public disposable values, never operator credentials. Existing named containers cause failure and are not removed.
- `sh scripts/test-image.sh <image>`: bounded direct Podman checks exact Node/native versions, actual table read with readonly bind of DB/WAL/SHM, EROFS on each file, INSERT rejection, full hashes/mtimes; inventory and entrypoint/backend/ingress checks. Needs backend sqlite3 installed on host. Run separately for amd64/aarch64 artifacts. Full s6/nginx initialization needs Supervisor API configuration; standalone initialization failure must be reported, never counted as ingress success.

No immutable mode is used. The old-image probe in runtime-bridge-wal-probe.cjs remains diagnostic only. No plan004 config/YAML refactor is included.
