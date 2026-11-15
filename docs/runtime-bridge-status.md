# Runtime bridge checkpoint — STOPPED, 2026-11-14

This is partial implementation, not release approval or a tested driver checkpoint for Plan004. No production database was accessed. No image was published or deployed. Plan metadata was not edited.

Base: local 49f55a3, merged fast-forward into prepared checkout `/Users/benjaminkoster/.t3/worktrees/ha-dbstats/t3-b3118327-a7c5e35268376d86`, branch `t3/upgrade-backend-runtime-bridge`. Separate mysql2 selection commit: `4e0231864b05ce0d2fbe59030a9592e5a1b9d157`.

## Per-step outcome

1. Baseline lock audit captured: 68 findings (30 high, 4 critical; totals do not establish reachability). Final published image unavailable: Docker daemon query hung and was interrupted; buildx command unavailable. Node/npm/OS/OpenSSL/nginx/SQLite CLI/driver final-image inventory is **not performed**. Machine-readable evidence is adjacent.
2. Source preparation only: maintained generic HA base index pinned, fetched directly from authenticated GHCR registry; index has amd64 and arm64 manifests. Official base source says Alpine 3.24.4. Alpine x86_64 v3.24 main APKINDEX lists nodejs 24.22.3-r0. aarch64 package availability and actual images **not verified**. Builder and runtime use the same musl base and Node package, native dependencies copied from builder; compiler packages omitted from runtime. Build/runtime smoke **not run**.
3. Engines use Node ^24.22.1; host is 24.22.1/npm 12.2.2. Backend/shared `npm config get legacy-peer-deps` both printed false; no matching npm_config legacy/force environment overrides found. Shared suppression removed; frontend exception retained. Unused nest-commander removed (no imports or cli-main found). mysql2 explicit; readonly SQLite flags and synchronize false preserved; migrationsRun remains default false. Shared `ci`/build, backend `ci`/build and all 11 config tests **passed**. Nest's removed keepConnectionAlive option removed. Integration runner added, but three-engine acceptance **failed/incomplete**.
4. Owning manifests checked with `npm view`; narrow overrides added for parser/express/lodash/path-to-regexp/tar/tar-fs. Initial node-gyp@12 override conflicted with direct dependency: corrected to node-gyp. `npm audit fix --ignore-scripts` refreshed compatible transitive resolutions. Final `npm ls --all` **FAILED**: nested @nestjs/platform-express express 5.2.1 remains invalid against override 5.3.0. Do not adopt this graph as peer-clean. Final production audit exits zero at high threshold (zero high/critical, three moderate records: glob, minimatch, TypeORM). These moderate findings remain unresolved; no reachability waiver is claimed. Full retained-copy list is in evidence. The graph needs clean re-resolution and verification of every copy before adoption.
5. Named `{*path}` wildcard and bodyParser:false implemented; explicit duplicate parsers removed after finding only GET controllers. Framework contract tests **not reached** because SQLite fixture fails first. Root/static routing, Swagger, invalid-body behavior, effective middleware chain and shutdown remain **unverified**. Backend lint exits zero with 24 warnings. Source CI/check-app Node major changed from 22 to 24 as explicitly authorized extension; full source check not run.
6. Native SQLite loads on host following allowed sqlite3 install script; fixture opens existing WAL database with flags OPEN_READONLY and SELECT 42 succeeds; attempted INSERT rejects SQLITE_READONLY. **No-write assertion FAILED**: fixture.db-shm hash changes after readonly driver access; database/WAL hashes and mtimes remained unchanged. Writable host fixture cannot establish actual read-only mounted behavior. Assertion preserved unchanged. Docker prerequisite for mounted read-only validation unavailable. STOP at this safety/prerequisite boundary. PostgreSQL/MariaDB connection, authentication, BIGINT/decimal/date/errors contracts not run. Source-build/prebuilt matrix not run. `scripts/test-image.sh` not implemented before STOP; image versions, entrypoint, health, ingress and platform gates remain incomplete.
7. armv7 removed from source metadata, release workflow and badges; unreleased changelog explains policy. Image artifacts do not exist locally, so artifact/metadata agreement **not validated**.

## Exact acceptance checks

- `npm --prefix dbstats/app/backend ci`: PASS; sqlite3 script explicitly allowed in package manifest; scarf/fsevents scripts blocked by npm policy.
- `npm --prefix dbstats/app/backend ls --all`: FAIL, ELSPROBLEMS nested express described above.
- `npm --prefix dbstats/app/backend audit --omit=dev --audit-level=high`: PASS threshold only; three moderate records remain.
- `npm --prefix dbstats/app/backend test -- --runInBand`: PASS 11/11 after config expectation update; dist excluded from Jest module discovery.
- `npm --prefix dbstats/app/backend run test:integration`: FAIL at unchanged-shm assertion, before HTTP/remote engines.
- `npm --prefix dbstats/app/backend run build`: PASS.
- `npm --prefix dbstats/app/backend run lint:check`: PASS with 24 warnings.
- `git diff --check`: PASS.

## Deviations and handoff

Framework and dependency updates are one incomplete source batch; separate config selection commit exists but is not independently runnable with baseline dependencies. Do not wire Plan004 transport/gateway against this checkpoint as tested. Docker work remains source-only, and final001 Docker corrections still need reconciliation. Frontend changes are engine metadata only (including lock root metadata), preserving scripts. No agents spawned. The baseline advisory audit was reconstructed from immutable baseline manifests in a temporary directory after Docker inventory was interrupted. A read-only mount test is required to distinguish expected SQLite shm lock bookkeeping on a writable fixture from any prohibited write under the real HA mount. Resolve the invalid Express nested copy before claiming dependency acceptance.

Primary evidence sources: https://registry.npmjs.org/ (npm view/audit), https://raw.githubusercontent.com/hassio-addons/addon-base/v21.0.11/base/Dockerfile , https://ghcr.io/v2/hassio-addons/base/manifests/21.0.11 , https://dl-cdn.alpinelinux.org/alpine/v3.24/main/x86_64/APKINDEX.tar.gz . No guarantee is inferred from candidate version numbers alone.

## Files changed since baseline

- `.github/workflows/check-app.yml`
- `.github/workflows/release.yml`
- `README.MD`
- `dbstats/CHANGELOG.md`
- `dbstats/Dockerfile`
- `dbstats/README.MD`
- `dbstats/app/backend/jest.config.ts`
- `dbstats/app/backend/package-lock.json`
- `dbstats/app/backend/package.json`
- `dbstats/app/backend/src/app.module.ts`
- `dbstats/app/backend/src/config.service.spec.ts`
- `dbstats/app/backend/src/config.service.ts`
- `dbstats/app/backend/src/database.module.ts`
- `dbstats/app/backend/src/main.ts`
- `dbstats/app/backend/test/integration.cjs`
- `dbstats/app/frontend/package-lock.json`
- `dbstats/app/frontend/package.json`
- `dbstats/app/shared/.npmrc`
- `dbstats/app/shared/package-lock.json`
- `dbstats/app/shared/package.json`
- `dbstats/build.yaml`
- `dbstats/config.yaml`
- `docs/runtime-bridge-evidence.json`
- `docs/runtime-bridge-status.md`
- `scripts/check-app.sh`
