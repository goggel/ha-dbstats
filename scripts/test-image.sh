#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
test "$#" = 1 || { echo 'usage: scripts/test-image.sh <image>'; exit 2; }
node scripts/test-image.cjs "$1"
