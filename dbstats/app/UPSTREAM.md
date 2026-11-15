# Application provenance

Imported from https://github.com/jehy/hass-dbstats at tag 0.3.23, commit
927ee43f7fe327e0eee2909af73877bd4a44784a. Tag verified with git ls-remote.

UPSTREAM.sha256 records every imported file, including all three package-lock.json
files. Initial copies are byte-for-byte archive contents. LICENSE and
frontend/LICENSE are preserved. No upstream workflows were imported.

Integration status: Dockerfile now builds explicit local source paths using Node 24
and installs native runtime dependencies in the final stage. This wiring is
UNVERIFIED: the legacy runtime's pinned Alpine packages are unavailable.
Plan 001 integration changes (original hashes remain in UPSTREAM.sha256):
- backend/frontend/shared package.json: add non-mutating lint:check scripts
  targeting all source TypeScript files. Existing lint rules remain intact.
- shared/src/stats/IShowAlerts.ts: only baseline Prettier whitespace corrections.
- No npm lockfiles or dependency versions changed.
- dbstats/.dockerignore excludes node_modules, dist and build from the context;
  all artifacts are rebuilt from source. Builder adds Python, make and g++.
- Release routes through the builder's --docker-hub and --image arguments,
  using github.repository_owner and dbstats-addon-{arch}. Builder 2025.02.0
  replaces floating master (its composite action requires a version tag).
  DBSTATS_RUNTIME_IMAGE_VERIFIED must remain unset until Plan 003 passes the
  runtime smoke gate. PR validation builds source only and never publishes.

Run `sh scripts/check-app.sh` from a clean checkout with Node 24. This runs
locked installs, all builds, the 11 configuration tests, non-mutating lint,
routing assertions and tracked-file cleanliness checks. The absent e2e config
is not included. Backend's existing 24 unused-variable warnings remain visible.
The two six-byte .db files and secrets.yaml files are upstream test fixtures,
not real Home Assistant databases or added credentials.

Plan 003 reconciles d122442 builder tooling: Python and py3-setuptools remain builder-only with node-gyp 12 and the musl Node 24 runtime; runtime tool absence is checked by scripts/test-image.sh. Historical Node 22 test results in NOTES.md are not final-image evidence.
