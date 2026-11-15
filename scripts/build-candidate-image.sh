#!/bin/sh
# Build owned sources; never import application output from another image or host.
set -eu
cd "$(dirname "$0")/.."
platform=${1:?usage: build-candidate-image.sh linux/arm64|linux/amd64 tag}
tag=${2:?image tag required}
case "$platform" in
  linux/arm64) arch=aarch64 ;;
  linux/amd64) arch=amd64 ;;
  *) echo 'Supported targets: linux/arm64, linux/amd64' >&2; exit 2 ;;
esac
engine=${CONTAINER_ENGINE:-podman}
ref=$(git rev-parse HEAD)
repository=${BUILD_REPOSITORY:-goggel/ha-dbstats}
# Buildah may reuse LABEL-only layers without reevaluating changed build args.
# Explicit labels are part of this fresh source build, not a subsequent retag.
if [ "$engine" = podman ]; then
  set -- --layers=true --format=docker
else
  set --
fi
exec "$engine" build "$@" --platform="$platform" \
  --build-arg "BUILD_REF=$ref" --build-arg "BUILD_ARCH=$arch" \
  --build-arg "BUILD_REPOSITORY=$repository" \
  --label "org.opencontainers.image.revision=$ref" \
  --label "org.opencontainers.image.source=https://github.com/$repository" \
  --label "org.opencontainers.image.documentation=https://github.com/$repository/blob/main/README.md" \
  -t "$tag" dbstats
