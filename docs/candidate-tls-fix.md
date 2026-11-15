# Candidate TLS fixture repair (2026-11-15)

Base: `695467c781d7dd5255fed042ec831da32aaf786b`.

The supplied redacted candidate log shows both native builds passing preceding image checks and failing `TLS fixture readiness`. The final transport runner mounted its `mkdtemp` directory (0700) as `/certs`. MariaDB drops to `mysql`; 0644 certificate files do not help when their directory cannot be traversed.

A Linux-container permission probe with MariaDB 11.8 reproduced the access failure independently of macOS bind-mount permission translation:

```sh
docker run --rm --entrypoint sh mariadb:11.8 -c '
mkdir /tmp/private-certs; chmod 700 /tmp/private-certs
touch /tmp/private-certs/server.key; chmod 644 /tmp/private-certs/server.key
gosu mysql test -r /tmp/private-certs/server.key; echo private-dir-readable=$?
chmod 755 /tmp/private-certs
gosu mysql test -r /tmp/private-certs/server.key; echo traversable-dir-readable=$?
'
```

Observed: `private-dir-readable=1`, `traversable-dir-readable=0`. This isolates directory traversal from certificate validity and server initialization.

The runner now mounts a 0755 child directory containing only the public certificates and disposable server key (0644). The private generation directory remains 0700; CA private keys are never mounted. On readiness failure it captures bounded state and recent logs for both containers, redacting MariaDB's generated root-password line and fixture password, without dumping container environment or key contents. Strict TLS assertions are unchanged.

The standalone runner copies individual 0644 files into container `/tmp`, rather than mounting the private generation directory. It does not share this traversal bug and needs no change.

Validation:

- `CONTAINER_ENGINE=docker node scripts/test-image-transport.cjs localhost/dbstats-native-stage:arm64`: passed actual trusted CA TLS, wrong/untrusted CA rejection, plaintext rejection, Unix socket selection, and rejection of a server without TLS support. No published ports.
- Full backend `npm run lint -- --max-warnings=0`: passed with zero warnings/errors after cleanup of the reproduced 28 unused-variable warnings. Logger signatures and privacy behavior preserved using explicit discards; no rule suppression.
- Backend `npm run build`: passed.
- Backend `npm test -- --runInBand`: 7 suites, 66 tests passed.
- `node --check scripts/test-image-transport.cjs` and `git diff --check`: passed.

Limits: Docker CLI uses context `podman`, server Podman 6.1.3 on Linux ARM64 (Fedora VM), not rootful Docker. The targeted permissions probe runs inside the Linux filesystem to avoid macOS mount translation masking the bug. Rootful Docker/GitHub reruns and AMD64 reruns remain for publication validation. The existing final image was tested, not rebuilt. Dependency/lock files and application SQL were unchanged. No push, PR, merge or deployment performed.
