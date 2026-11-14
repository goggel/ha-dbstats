#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
node -e 'if (process.versions.node.split(".")[0] !== "22") throw Error("Node 22 required")'
npm --prefix dbstats/app/shared ci
npm --prefix dbstats/app/shared run build
npm --prefix dbstats/app/backend ci
npm --prefix dbstats/app/backend run build
npm --prefix dbstats/app/backend test -- --runInBand
npm --prefix dbstats/app/frontend ci
npm --prefix dbstats/app/frontend run build
for package in shared backend frontend; do
  npm --prefix "dbstats/app/$package" run lint:check
done
node scripts/check-routing.cjs
test -f dbstats/app/backend/dist/backend/src/main.js
test -f dbstats/app/frontend/build/index.html
git diff --check
git diff --exit-code
