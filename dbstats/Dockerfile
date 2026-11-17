ARG BUILD_FROM=ghcr.io/hassio-addons/base:21.0.11@sha256:79fd58d9d7f2820e8b2e7d2b11a24e22b96ae7a48569af3372183592a1b22974
# BuildKit/Buildah supply BUILDPLATFORM for the builder, independently of --platform.
ARG BUILDPLATFORM
FROM --platform=${BUILDPLATFORM} ${BUILD_FROM} AS frontend-build
RUN apk add --no-cache nodejs=24.22.3-r0 npm
WORKDIR /build
# Install from manifests before copying sources; backend changes cannot invalidate this cache.
COPY app/frontend/package.json app/frontend/package-lock.json app/frontend/.npmrc frontend/
RUN node -p '"frontend builder: " + process.platform + "/" + process.arch + " Node " + process.version' && npm --prefix frontend ci
COPY app/shared/ shared/
COPY app/frontend/.eslintrc.json app/frontend/.eslintignore app/frontend/config-overrides.js app/frontend/tsconfig.json app/frontend/tsconfig.path.json frontend/
COPY app/frontend/src/ frontend/src/
COPY app/frontend/public/ frontend/public/
RUN npm --prefix frontend run build

# Native backend dependencies and runtime both use the requested target platform.
FROM ${BUILD_FROM} AS app-build
RUN apk add --no-cache nodejs=24.22.3-r0 npm python3 py3-setuptools make g++
WORKDIR /build
COPY app/shared/package.json app/shared/package-lock.json app/shared/.npmrc app/shared/.eslintrc.js app/shared/.prettierrc app/shared/tsconfig.json shared/
COPY app/shared/src/ shared/src/
RUN npm --prefix shared ci && npm --prefix shared run build
COPY app/backend/package.json app/backend/package-lock.json app/backend/.npmrc app/backend/nest-cli.json app/backend/tsconfig.json app/backend/jest.config.ts backend/
COPY app/backend/src/ backend/src/
RUN npm --prefix backend ci && npm --prefix backend run build
COPY app/backend/test/runtime-dependencies.cjs backend/test/runtime-dependencies.cjs
# sqlite3's optional node-gyp peer is needed only when compiling the native addon.
RUN npm --prefix backend prune --omit=dev --omit=optional \
    && node backend/test/runtime-dependencies.cjs backend
# hadolint ignore=DL3006
FROM ${BUILD_FROM}

# Set shell
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apk add --no-cache nodejs=24.22.3-r0 npm sqlite nginx \
    && rm -rf /etc/nginx

# Copy root file system
COPY rootfs /

COPY --from=app-build /build/backend/dist /usr/src/app/dist
COPY --from=app-build /build/backend/node_modules /usr/src/app/node_modules
COPY app/backend/package.json /usr/src/app/package.json
COPY --from=frontend-build /build/frontend/build /var/www/html
COPY app/UPSTREAM.md /usr/src/app/UPSTREAM.md
WORKDIR /usr/src/app
# Health check
#HEALTHCHECK --start-period=10s \
#    CMD curl --fail http://127.0.0.1:3000 || exit 1

# Build arguments
ARG BUILD_ARCH
ARG BUILD_DATE
ARG BUILD_DESCRIPTION
ARG BUILD_NAME
ARG BUILD_REF
ARG BUILD_REPOSITORY
ARG BUILD_VERSION

# Set NODE_ENV environment variable
ENV NODE_ENV production

# Labels
LABEL \
    io.dbstats.application.revision="927ee43f7fe327e0eee2909af73877bd4a44784a" \
    io.hass.name="${BUILD_NAME}" \
    io.hass.description="${BUILD_DESCRIPTION}" \
    io.hass.arch="${BUILD_ARCH}" \
    io.hass.type="addon" \
    io.hass.version=${BUILD_VERSION} \
    maintainer="Jehy" \
    org.opencontainers.image.title="${BUILD_NAME}" \
    org.opencontainers.image.description="${BUILD_DESCRIPTION}" \
    org.opencontainers.image.vendor="Jehy" \
    org.opencontainers.image.authors="Jehy" \
    org.opencontainers.image.licenses="MIT" \
    org.opencontainers.image.url="https://jehy.ru" \
    org.opencontainers.image.source="https://github.com/${BUILD_REPOSITORY}" \
    org.opencontainers.image.documentation="https://github.com/${BUILD_REPOSITORY}/blob/main/README.md" \
    org.opencontainers.image.created=${BUILD_DATE} \
    org.opencontainers.image.revision=${BUILD_REF} \
    org.opencontainers.image.version=${BUILD_VERSION}


EXPOSE 3000
EXPOSE 6060
