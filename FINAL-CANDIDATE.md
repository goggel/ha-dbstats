# Native frontend build refinement — COMPLETE

Required base: `f25b85b915ef8585563bf6cf1a017f1cc466a111`. Runtime source/build ref: `99a7cf477a6fc8fc38e4af022b06ece8ce12c3be`. Branch: `t3/native-frontend-build-stage`; isolated worktree: `/Users/benjaminkoster/.t3/worktrees/ha-dbstats/t3-47961f80-0f68f091980663b4`.

New immutable candidates (repository label `https://github.com/goggel/ha-dbstats`, revision above):

| Platform | Image ID | BUILD_ARCH |
| --- | --- | --- |
| linux/arm64 | `de30ab28082b6eddd89dfca9d320cad6c19f548c79463ad65e02f5edb1e4d045` | aarch64 |
| linux/amd64 | `3c9992205a0192a6a6e7bdf70e020cbede07e80707cd993f06620ba440ba4fb5` | amd64 |

All five unchanged scripts passed on each actual ID: `test-image.sh`, `test-nginx-render.cjs`, `test-image-databases.cjs`, `test-image-transport.cjs`, `test-image-domain.cjs`. Strict readonly/WAL/native interruption/start-stop/ingress/assets, native timeout/replacement/recovery, real TLS/socket and complete domain/PG15 behavior remain enforced. Only assertions/fixtures were mounted; application code came from each image. No host ports published. Fixture cleanup remains bounded. Labels/platform/Node 24.22.3 agree; emitted frontend assets and selected event/domain/gateway JS hashes match across both images. Full output, labels and hashes are in `docs/final-candidate-evidence.json` under `nativeFrontendRefinement`.

The Dockerfile builds owned static frontend sources in `FROM --platform=${BUILDPLATFORM}` with an independent manifest-only dependency cache, then shared/frontend sources at the existing sibling paths. Only emitted assets cross into runtime. Backend native modules and runtime retain the same target base, musl/ABI, Node pin and driver inputs. No application sources, dependencies, lockfiles, template/lifecycle, asset-stage values, release metadata or plan metadata changed. The helper retains explicit build-time provenance labels to work around observed Podman stale LABEL-only caching.

[Docker documentation](https://docs.docker.com/build/building/multi-platform/) specifies automatic BUILDPLATFORM and native-stage FROM selection. [Podman documentation](https://docs.podman.io/en/latest/markdown/podman-build.1.html) documents build arguments/platform selection. Actual Podman 6.2.0 client/6.1.3 linux/arm64 server accepted the native FROM for both targets; both frontend logs print `linux/arm64 Node v24.22.3`. CI uses the same pinned multi-platform base index, with no hardcoded native architecture. A Docker engine was not independently exercised for a second engine build.

Native build completed, but its first result reused an old ID with stale provenance; rejected. A fresh source build with explicit labels took 21.778s from completed stage caches and yielded the accepted new arm64 ID. Initial cache-populating native build wall time was approximately 21 minutes (not precisely instrumented); compilation succeeded. For amd64, sampled stage times (including commits) were frontend 980.355s, backend 717.784s. Frontend ci/commit took 224.522s, source copy layers 569.412s, build/commit 170.383s. Backend ci/build/commit took 479.230s and prune/commit 88.213s. The first amd64 build hit the unchanged 1800s bound during final assembly and was terminated. **One evidence-backed assembly continuation**, using the exact completed owned-source native frontend and target backend caches, finished in 109.137s. No opaque app-image import or timeout extension occurred. A cold single-invocation amd64 build under 1800s is not established; storage/layer overhead remains a development-host limitation. The stage dependency cache is structurally independent, though this Podman invocation rebuilt it across target platforms.

`sh scripts/check-app.sh` passed in this checkout: root dependency resolution/audit threshold/builds/backend tests/integration/all three baseline lint checks/routing/clean diff. Existing lint warnings remain. Unchanged dependencies were not reinstalled again. Helper shell syntax and final `git diff --check` passed. All gate timings are recorded in evidence. The final reporting/helper commit follows the runtime source commit; runtime inputs are unchanged.

Backend moderate and legacy frontend advisory findings remain as recorded below. Live HA/Supervisor/browser acceptance still requires an authorized disposable supervised installation. No push, PR, merge, publication, deployment, production DB access, additional checkout or agents.

Everything below is **historical evidence**, superseded for current artifact acceptance by the two new IDs above.

---

# Final candidate — STOPPED

Local composition and arm64 acceptance passed. **Dual-platform acceptance is incomplete:** amd64 build exceeded its 1800-second wall bound during frontend installation. The owned build process was terminated; no new amd64 artifact exists. A responsive bounded amd64 build environment is the remaining local prerequisite. No release/deployment acceptance is claimed.

## Source and artifacts

- Worktree: `/Users/benjaminkoster/.t3/worktrees/ha-dbstats/t3-f75b5f48-1f7aa4c864dc7686`; branch `t3/compose-final-candidate`.
- Prepared base: `9b7ab722f70f5222d77a6b508bab32be8462979f`.
- Preserved input histories: source `57eb1cfc82fa0ad46b29723cab546eeb5b44662c` and image revision `9fcdabcc5b7d190eadb586b8b326f4f70f4ea679`.
- Composition/runtime-input source and image BUILD_REF: `fa8c9cd84493d4113ecb565443fc6987cbd3699a`.
- Validated implementation head: `30066e0b93e6153d49e6527be4e3b9682c0bc74d`. Later reporting commit adds only this report and its JSON evidence. Resolve its exact head with `git rev-parse t3/compose-final-candidate`.
- Accepted linux/arm64 immutable image: `4db785153995d034c3c262b18edf51f00d48597808b835f389be4b6c3f40b61e` (`localhost/dbstats-composed-owned:arm64`). BUILD_ARCH is `aarch64`; BUILD_REPOSITORY is `goggel/ha-dbstats`.
- linux/amd64: **not built/accepted**. No manifest or supported-platform artifact agreement can be claimed for the pair. Metadata still supports aarch64/amd64; no armv7 claim or release version bump was added.
- `io.dbstats.application.revision=927ee43f7fe327e0eee2909af73877bd4a44784a` identifies the bundled upstream baseline, not this fork's runtime source. OCI revision identifies the composed fork above; OCI source identifies `https://github.com/goggel/ha-dbstats`.

Runtime input diff from image source to implementation head is empty across Dockerfile/rootfs, backend src/manifests/lock, frontend, shared and UPSTREAM.md. The only intervening changes are the domain evidence runner and its image wrapper. Byte comparisons against the actual image passed for compiled EventService, domain SQL helper, QueryGateway, nginx config/init and UPSTREAM.md; hashes and labels are in `docs/final-candidate-evidence.json`. Corrected EventService contains the PostgreSQL 16 minimum message. Neither old reviewed artifact was relabeled or accepted as this composition.

## Passed checks

On the accepted immutable arm64 ID, all exited zero:

```sh
sh scripts/test-image.sh <ID>
node scripts/test-nginx-render.cjs <ID>
node scripts/test-image-databases.cjs <ID>
node scripts/test-image-transport.cjs <ID>
node scripts/test-image-domain.cjs <ID>
```

Strict assertions retain readonly DB/WAL/SHM EROFS, hashes/mtimes, actual WAL value 42, INSERT rejection, native interruption/recovery, real s6 startup/clean bounded stop, ingress allow/deny and fetched assets. SQL/TLS suites retain native cancellation codes, replacement sessions, no orphan work, pool recovery, certificate rejection and actual sockets. These use actual image code and named owned fixtures with no host ports. The Supervisor metadata server is a **controlled fixture**, not live HA.

The new domain wrapper mounts test assertions only, never replacement compiled application code. Native SQLite, MariaDB, MySQL and PG16 each proved 100 references produce count 100 through actual EventService/QueryGateway. Existing malformed/adversarial Unicode, bounded transfer, sorting/limit and timeout/recovery assertions passed. PG15 returned the domain-specific version message and passed the unaffected event-type metric. No other chart/engine requirement was narrowed.

Combined source: shared/backend/frontend clean dependency installs and builds, backend dependency tree and production audit threshold, 66 backend tests, 21 frontend tests, all three lint checks, SQLite/HTTP integration, fixture target rejection, publication routing and postcommit clean diff passed. Backend/shared legacy-peer-deps are false. `sh scripts/check-app.sh` exited 1 only at its last dirty-diff assertion before the runner was committed; subsequent clean diff checks passed without reinstalling dependencies. Aggregate baseline/equivalence/index/configuration and diagnostic assertions passed in an isolated namespace using the composed host source; this is source coverage, not final-image aggregate coverage. No benchmark candidate was adopted and no representative 60-million-row performance claim is made.

## Failed attempts and skipped gates

- Initial direct execution of non-executable check-app.sh: exit 126; corrected by invoking `sh`.
- First native build used an incorrect repository argument. Cached rebuild retained that label despite the corrected argument; provenance rejected it. A fresh build invocation with matching explicit source/documentation labels produced the accepted arm64 ID, and all suites were rerun on it. No old artifact was relabeled.
- Initial arm64 domain attempt: PostgreSQL 16 fixture absent locally. Bounded pulls of PG16/PG15 succeeded; full domain matrix subsequently passed.
- Aggregate first attempt omitted fixture configuration; corrected. Second attempt timed out during the observed Podman delays; third unchanged assertion run passed after build progress resumed.
- Bounded Podman storage and VM probes timed out; container listing worked. This does not establish the infrastructure root cause.
- amd64 `podman build --layers=false --platform=linux/amd64 --format=docker ...` exceeded 1800 wall seconds; terminated with SIGTERM. **All four amd64 image suites, amd64 domain matrix, labels/byte provenance and paired artifact agreement are skipped.** No 600-second retry or weakened assertion was used.

## External prerequisites and review

Live HA/Supervisor ingress/browser acceptance requires an authorized disposable supervised installation. No operator endpoint/token, production database, deployment, publish, push, PR, merge, agents or plan metadata changes were authorized or performed.

Backend production audit retains three moderate records; legacy frontend retains 75 advisory records (20 low, 16 moderate, 35 high, 4 critical) and existing peer suppression. These are documented findings, not waivers or a clean-security-release claim. 006B/007/009 and dependency upgrades remain outside scope.

Review the merge, two scoped runner files, this report, evidence JSON, immutable arm64 artifact and retained local logs. Previous runtime reports remain historical. Runtime fixture cleanup ran in finally blocks; other task resources/caches were not removed. Build intermediates remain in safe shared cache.
