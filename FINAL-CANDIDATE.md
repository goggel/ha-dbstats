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
