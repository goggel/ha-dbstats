# Candidate audit failure after merge

The [2026-11-17 candidate run](https://github.com/goggel/ha-dbstats/actions/runs/44167721149) at `df5c469e98551448cc220b1ce24ca96d1841cd5b` failed on both architectures at the backend production dependency audit. It had not reached compilation, frontend tests or image building. The audit reported eight records: five high and three moderate.

The high findings come from [CVE-2026-112366 / GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), whose reviewed advisory was updated on November 17 and lists no patched picomatch release. The installed chain is `sqlite3 -> optional peer node-gyp -> tinyglobby -> fdir/picomatch`. The manifest already declares node-gyp as a development dependency, but its optional-peer relationship causes `npm prune --omit=dev` to retain it in the runtime. This is why a previously passing production audit can begin failing without a lockfile change.

## Fix

- Keep the complete locked toolchain in the builder so SQLite can compile from source when needed.
- After native installation/compilation, prune development **and optional** packages from the backend runtime. This removes node-gyp and its globbing chain; SQLite's required bindings/helper dependencies remain.
- Audit that same runtime dependency set with `--omit=dev --omit=optional --audit-level=high`.
- Check the pruned builder and the final image for retained native build tools, and execute a real native SQLite query. Existing image tests still cover read-only WAL, interruption, databases and ingress.

This does not ignore an advisory or relax the high/critical threshold. No dependency version, lockfile or database behavior changes. It also does not claim the full development/build graph has no vulnerabilities: native builds remain a separate trusted-input build-tool surface. Do not accept untrusted glob patterns into that toolchain; revisit the package once a compatible patch is published.

The three remaining moderate audit records are glob, minimatch and TypeORM. npm's suggested forced ORM major upgrade would change drivers and compatibility; that migration is outside this narrowly scoped CI repair. The existing high/critical release threshold remains in place.

## Regression evidence

- Reproduced the original audit against the unchanged backend lockfile: exit 1, eight records including five high.
- Ran the runtime guard after the original prune: failed on retained `node-gyp`, `tinyglobby`, `fdir` and `picomatch`.
- Ran the same guard against the previously accepted arm64 runtime image: failed on the same retained build tooling.
- Added optional pruning on a disposable copy: the guard passed, including `SELECT 42` through the compiled SQLite driver.
- Re-audited the intended runtime set: exit 0, zero high/critical and three moderate records.
- Repeated pruning and the repaired audit with the runner's exact npm 11.19.1: the guard and native query passed, audit exit 0 with the same three moderate records. All direct runtime dependencies still resolve.
- Source checks passed: shared/backend/frontend builds; 83 backend and 23 frontend tests; all three lint checks; SQLite native/WAL/read-only and HTTP integration fixtures; routing/candidate/publication-absence checks.

The full arm64 image rebuild was attempted but the local Podman service disconnected during frontend source COPY, before the changed backend pruning step. A subsequent engine probe reported an SSH connection reset. This is an unmet final-image verification gate, not a successful image acceptance. The VM was not restarted, and no image was published or deployed.

The runtime guard is `dbstats/app/backend/test/runtime-dependencies.cjs`. It is run during the image build and reused by `scripts/test-image.cjs`, so changing only audit flags cannot conceal a runtime that still ships the affected chain.
