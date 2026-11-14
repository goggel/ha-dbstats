ARG BUILD_FROM=ghcr.io/hassio-addons/base-nodejs:0.2.5
FROM node:22-alpine AS app-build
RUN apk add --no-cache python3 make g++
WORKDIR /build
COPY app/shared/package.json app/shared/package-lock.json app/shared/.npmrc app/shared/.eslintrc.js app/shared/.prettierrc app/shared/tsconfig.json shared/
COPY app/shared/src/ shared/src/
RUN npm --prefix shared ci && npm --prefix shared run build
COPY app/backend/package.json app/backend/package-lock.json app/backend/.npmrc app/backend/nest-cli.json app/backend/tsconfig.json app/backend/jest.config.ts backend/
COPY app/backend/src/ backend/src/
RUN npm --prefix backend ci && npm --prefix backend run build
COPY app/frontend/package.json app/frontend/package-lock.json app/frontend/.npmrc app/frontend/.eslintrc.json app/frontend/.eslintignore app/frontend/config-overrides.js app/frontend/tsconfig.json app/frontend/tsconfig.path.json frontend/
COPY app/frontend/src/ frontend/src/
COPY app/frontend/public/ frontend/public/
RUN npm --prefix frontend ci && npm --prefix frontend run build

# hadolint ignore=DL3006
FROM ${BUILD_FROM}

# Set shell
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Install requirements for add-on
RUN apk update
RUN  apk add --no-cache  gcc=13.2.1_git20231014-r0
#RUN  apk add --no-cache              g++=13.2.1_git20231014-r0
RUN  apk add --no-cache              py3-pip=23.3.1-r0
RUN  apk add --no-cache              python3=3.11.11-r0
RUN  apk add --no-cache   sqlite=3.44.2-r0
RUN  apk add --no-cache  nginx=1.24.0-r16
RUN  rm -f -r /etc/nginx

# Copy root file system
COPY rootfs /

COPY --from=app-build /build/backend/dist /usr/src/app/dist
COPY app/backend/package.json app/backend/package-lock.json app/backend/.npmrc /usr/src/app/
COPY --from=app-build /build/frontend/build /var/www/html
COPY app/UPSTREAM.md /usr/src/app/UPSTREAM.md
WORKDIR /usr/src/app
# Compile SQLite for the final platform and Node ABI, never copy builder binaries.
RUN apk add --no-cache --virtual .native-build g++ make python3 \
    && npm_config_build_from_source=true npm ci --omit=dev --no-fund --no-audit \
    && npm cache clean --force \
    && apk del .native-build

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
