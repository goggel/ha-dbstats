# Final-image acceptance — 001/003/004

Both actual final images passed strict image acceptance, nginx rendering and isolated three-engine SQL/cancellation checks. These are local artifacts, not published releases or live HA acceptance.

## Checkout and provenance

- Tool-prepared checkout: `/Users/benjaminkoster/.t3/worktrees/ha-dbstats/t3-09dd8835-de2a844dcf64159a`.
- Branch: `t3/final-image-native-acceptance`.
- The prepared branch initially pointed at `9b7ab722f70f5222d77a6b508bab32be8462979f`; it was fast-forwarded in place to the required unpublished base `13c6fac987cdb819e6ec1f43e372a39e7f6ab6d0`. No other checkout was created or edited.
- Both accepted image labels record source `67d78dcad3e3de3322e6741297be7144a8b77f75`. Later implementation head `19b32357025c9c740c17d8afbe6a87de230b7857` changes acceptance scripts only; reporting commits follow. All runtime inputs are unchanged after the image source commit.
- No dependency lock, backend/frontend application implementation, domain fixture, build base or publication configuration was changed. No unreviewed Concurrent006A work was adopted.

| Platform | Immutable local image ID | Local manifest digest |
| --- | --- | --- |
| linux/arm64 | `e46c70ff49363c6b1113393151b93be949e4cb63e57061ea5c424f5eebe3b427` | `sha256:afee6dd2a47ee50bba6791d9605a5f27faeed78659084f07688ddb5d29d8b9f1` |
| linux/amd64 | `d13ddbdd1fb6d49a82bd8c2b87fb57a20f65beb56f8cc21e80e2107c061cf413` | `sha256:d1db8130840d58b17de53cc67405df04adc6ff824aefa1cf73e3f200e11e7665` |

Tags are `localhost/dbstats-final-owned:arm64` and `:amd64`. Local acceptance builds set BUILD_REF/BUILD_ARCH/BUILD_REPOSITORY; release name/date/version arguments retained their empty defaults. These are not release-metadata or published-manifest acceptance artifacts. Accepted architecture metadata agrees with aarch64/amd64 add-on support; no armv7 mainline claims were found in README/config/build/workflow scope. Earlier diagnostic images and other executors' images/caches were retained.

## Changes and measured diagnosis

The inherited logs showed 50–120 second gaps around layer creation, without a deterministic compiler failure. Native registry ping returned in 274 ms; selected builder reported Node 24.22.3, npm 11.12.1, Python 3.14.10 and g++ 15.2.0. Bounded Podman info/VM SSH probes intermittently timed out, then recovered. These observations do not establish a single infrastructure cause.

Native builds reused safe layers. After the native path worked, amd64 used `podman build --layers=false --platform=linux/amd64 --format=docker`, avoiding intermediate layer commits. It finished successfully in **860.1778 seconds**, within its 1800-second bound. A controlled 20-million-iteration CPU probe took 156.5076 ms natively and 2658.3941 ms under emulation. Emulation has measurable cost, but did not prevent final-image acceptance; this ratio is not a total-build estimate.

Scoped fixes:

- The explicitly permitted one-expression formatting correction in `query-gateway.spec.ts`; lint now has zero errors and the inherited 32 warnings.
- Nginx init now calls the selected base's `bashio::app.*` functions; `bashio::addon.*` is absent there.
- Actual final-image HTTP exposed a two-pass nginx substitution assumption. JS/CSS/image/manifest/favicon rewrites now produce absolute ingress paths in one pass. The allowlist remains unchanged.
- Image checks use a disposable Supervisor metadata server and token with actual `/init`, Bashio init and service scripts. They publish no host ports. Readiness/stop calls are bounded; all DB/WAL/SHM hashes and mtimes are compared and retained in JSON evidence.
- `test-nginx-render.cjs` requires an explicit selected image and no longer defaults to an older base fixture.
- `test-image-databases.cjs` mounts the unchanged approved test scripts read-only into the final image. Its uniquely named MariaDB/PostgreSQL/MySQL fixtures share a network namespace with `--network=none`, publish no ports, and are removed with their own disposable volumes. PostgreSQL explicitly uses SCRAM for loopback authentication so bad-password rejection is meaningful.

## Checks and inventory

Passed on **both immutable final images**:

```sh
scripts/test-image.sh <immutable-image-ID>
node scripts/test-nginx-render.cjs <immutable-image-ID>
node scripts/test-image-databases.cjs <immutable-image-ID>
node scripts/test-image-transport.cjs <immutable-image-ID>
```

The strict image check proves native load/query; actual WAL-backed value 42; EROFS on DB/WAL/SHM append attempts; rejected SQL INSERT; identical hashes/mtimes after queries and startup/shutdown; expected entrypoint and static index files; real s6 startup; backend HTTP; ingress allow/deny; rewritten HTML URLs and fetched JS/CSS/manifest/favicon; native SQLite interruption and healthy subsequent reads; clean bounded stop. Arm64 startup/stop measured 3274/3283 ms; amd64 13487/3890 ms, both exit 0.

The SQL checks passed MariaDB/PostgreSQL read/BIGINT/decimal/date/error/auth contracts, and MariaDB/MySQL/PostgreSQL two-session cancellation, native timeout codes, session replacement, healthy queries, idle pool baselines and datasource close. MariaDB's real HTTP timeout/following-metric/no-orphan-SQL case also passed. The approved TLS/socket assertion body and effective-options helper also ran inside both final images: trusted CA, wrong/untrusted CA rejection, required transport rejection, real Unix socket selection and required TLS against a server without TLS support. Host preparation generated disposable certificates and containers, without installing tools in either runtime; its isolated namespace published no ports.

This checks cancellation and resource cleanup separately from idle s6 stop; it does not claim a live HA in-flight shutdown scenario.

Both artifacts report Alpine **3.24.4**, `nodejs-24.22.3-r0`, `npm-11.12.1-r0`, `nginx-1.30.6-r0`, `sqlite-3.53.4-r0`, `sqlite-libs-3.53.4-r0`, `libssl3-3.5.9-r0` and `libcrypto3-3.5.9-r0`. OpenSSL CLI is absent; Node reports OpenSSL **3.5.9**. Compiler/Python runtime executables are absent. Full Alpine package revisions are embedded in the JSON evidence.

SQLite values are deliberately separate: CLI **3.53.4**, sqlite3 package **6.0.1**, exported header `VERSION` **3.52.0**, actual Node-driver `SELECT sqlite_version()` **3.53.4**. Node links `libsqlite3.so.0`; do not label the SQL engine 3.52.0 solely from the module constant.

Every installed retained parser/YAML/archive copy was inventoried: Express 5.3.0, body-parser 2.4.0, js-yaml 4.3.2 and nested Swagger js-yaml 5.5.0, tar 7.5.23, tar-fs 2.1.4, node-gyp 12.4.0, prebuild-install 7.1.3, TypeORM 0.3.31. Both final images passed production `npm ls --all --omit=dev --json` and `npm audit --omit=dev --audit-level=high --json`, with the unchanged lock mounted read-only: **zero high/critical; three moderate records** (glob, minimatch, TypeORM). Raw counts do not establish reachability.

Host checks passed: backend clean ci output, dependency tree, all 58 tests, backend build, lint, SQLite integration diagnostic, HTTP integration and fork/publication routing. Backend/shared `legacy-peer-deps` each returned `false`; no force/legacy overrides were found in CI. The source production CLI `dist/backend/src/main` resolves to the same `.js` file invoked by s6 at `/usr/src/app/dist/backend/src/main.js`; `/var/www/html/index.html` exists. The inherited writable SQLite diagnostic classifies SHM offset 104 read-mark changes; it is distinct from the strict mounted read-only final-image gate.

Native path evidence is conclusive but scoped: installed `prebuild-install` reads `npm_config_build_from_source`; backend npm policy permits sqlite3 scripts. Explicit arm64 source compilation used node-gyp 12.4.0, matching Node headers, and produced `gyp info ok`, native load and a successful SQL query in a separate disposable cached builder. This is not relabeled as a source-built final artifact. Selected final binaries match musl prebuilt archives: arm64 `cc56ac512b0b57160bad60235759aaf9222e05b9e3cec0aa2d0808986b36813c`; amd64 `5e1ad6cd482d1e4226d49ed77628328eeb7c169e56fd7387c6ae93b798b8f0bb`. The amd64 archive was actually downloaded and compared byte-for-byte in a disposable container. A targeted amd64 source probe copied only the selected final image's target-native modules into the matching cached amd64 toolchain. It compiled and linked successfully (`gyp info ok`), loaded and queried with Node 24.22.3 / header 3.52.0 / SQL runtime 3.53.4, producing source binary SHA-256 `a21e865fd74e01720c317d4ffac11866ae64a8f26cbc4a0d8fd52efd9fbc5e80`. Its optional standalone image export hit the 600.0136-second bound at COMMIT after that successful query; no source-probe image was retained. This is not a failed final-image build or a claim that either accepted artifact ships the source-built binary. Source-built modules received compile/load/query coverage; the strict mounted WAL gates above apply to the actual prebuilt final artifacts.

## Incomplete gates and limits

- Live HA/Supervisor/browser acceptance remains pending. Prerequisite: an authorized disposable supervised HA installation and its ingress/browser flow. No real deployment, production endpoint or operator token was accessed here.
- The unchanged legacy frontend retains peer suppression and its installation graph reports 75 records (20 low, 16 moderate, 35 high, 4 critical). Plan 007 remains separate; these counts are not a claim about bundled exploitability. Backend's three moderate production records remain unresolved; no sweeping dependency upgrade was attempted.
- Independent review of these new scoped commits remains for the parent/reviewer. No agents were started. Publication/deployment gates remain disabled; no push, PR, publish or deploy occurred.

`runtime-bridge-final-evidence.json` contains exact artifact metadata, package revisions, test outputs, file hashes/mtimes, audit records, measured timing and failed-attempt corrections. No plan metadata was edited.

## Exact changed files

- `dbstats/app/backend/src/query-gateway.spec.ts`
- `dbstats/rootfs/etc/cont-init.d/nginx.sh`
- `dbstats/rootfs/etc/nginx/nginx.conf`
- `scripts/test-image.cjs`
- `scripts/test-image-databases.cjs`
- `scripts/test-image-transport.cjs`
- `scripts/test-nginx-render.cjs`
- `docs/runtime-bridge-final-evidence.json`
- `docs/runtime-bridge-final-status.md`

Dedicated final-artifact provenance checks also confirmed that both images contain the source-identical `UPSTREAM.md` (SHA-256 recorded in JSON), entrypoint and index. Synthetic production/arbitrary fixture URL rejection passed. Required source13c6fac is an ancestor of the exact image source; runtime inputs have no diff after that image source.

Cleanup inspection found no task-named runtime/SQL/TLS containers or source-probe external build container remaining. Other external build containers and other executors’ fixtures/caches/images were left untouched. Throwaway host probe scripts were removed; tool logs remain available and their relevant evidence is embedded in JSON.
