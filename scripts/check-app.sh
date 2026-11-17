#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
node -e 'if (process.versions.node.split(".")[0] !== "24") throw Error("Node 24 required")'
npm --prefix dbstats/app/shared ci
npm --prefix dbstats/app/shared run build
npm --prefix dbstats/app/backend ci
npm --prefix dbstats/app/backend ls --all
# Match the final image, which excludes optional native-build tooling after compilation.
npm --prefix dbstats/app/backend audit --omit=dev --omit=optional --audit-level=high
npm --prefix dbstats/app/backend run build
npm --prefix dbstats/app/backend test -- --runInBand
node dbstats/app/backend/test/full-history-attributes.cjs
node dbstats/app/backend/test/storage-coverage.cjs
node dbstats/app/backend/test/fixture-targets.cjs
FIXTURE_PHASE=sqlite npm --prefix dbstats/app/backend run test:integration
FIXTURE_PHASE=http npm --prefix dbstats/app/backend run test:integration
npm --prefix dbstats/app/frontend ci
npm --prefix dbstats/app/frontend run build
CI=true npm --prefix dbstats/app/frontend test -- --runInBand
for package in shared backend frontend; do
  npm --prefix "dbstats/app/$package" run lint:check
done
node scripts/check-routing.cjs
node scripts/check-candidate.cjs
python3 scripts/test-candidate-absence.py
test -f dbstats/app/backend/dist/backend/src/main.js
test -f dbstats/app/frontend/build/index.html
git diff --check
git diff --exit-code
