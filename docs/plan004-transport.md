# MySQL recorder transport mapping

Verified against current official documentation on 2026-11-14:
- [HA recorder URI examples](https://www.home-assistant.io/integrations/recorder/): charset, `ssl_mode=REQUIRED`, and `unix_socket`.
- [TypeORM MySQL options](https://typeorm.io/docs/drivers/mysql/): charset, ssl and socketPath. Tests use installed TypeORM 0.3.31, rather than assuming current 1.x behavior.
- [mysql2 SSL](https://sidorares.github.io/node-mysql2/docs/documentation/ssl): CA is certificate content, not a filename; TLS without a custom CA uses system trust.

The explicit MySQL query allowlist is `charset` (default utf8mb4), `ssl=true`, `ssl_mode=REQUIRED|VERIFY_CA|VERIFY_IDENTITY`, `ssl_ca=/existing/file`, and `unix_socket=/existing/socket`. Both `&` and the legacy documented `;ssl=true` separator work. Separators are split before decoding; percent-encoded credentials and values retain their meaning. Duplicate, empty and unknown options fail with CONFIG_MYSQL_TRANSPORT_INVALID, without including the URI or option values. This intentionally rejects unsupported TLS controls and downgrade modes, including `ssl=false`, rather than silently ignoring them.

All TLS forms require certificate chain and hostname verification, including REQUIRED and VERIFY_CA (a deliberate strengthening). A CA alone enables verified TLS. Certificate contents are read from an existing absolute path already accessible to the add-on; no mount or permission changes are made. Socket paths must be existing absolute Unix sockets. Combining socket and TLS options is rejected explicitly. No client-certificate/key URI support is claimed. Arbitrary SQLAlchemy/mysqlclient URI options are not forwarded.

Run after shared/backend dependency installation and backend build:

```
npm --prefix dbstats/app/backend test -- --runInBand
node dbstats/app/backend/test/transport/run.cjs
npm --prefix dbstats/app/backend run build
npm --prefix dbstats/app/backend run lint:check
git diff --check
```

The standalone fixture owns only `dbstats-plan004-transport-fixture`, refuses an existing name, uses MariaDB 11.8 on loopback port 33316 with disposable credentials and temporary container storage, and cleans up only after successful creation. OpenSSL generates one-day disposable CA/server/wrong-CA keys locally. Only public fixture certificates and the generated fixture server key are copied into the container; no host secret mounts. Every subprocess and connection is bounded. A local socket protocol server proves actual socket selection with an unreachable TCP hostname. Fixture setup requires Podman, OpenSSL and the MariaDB image. It accepts no external database URL.

Integration note for gateway composition: this change removes ineffective MySQL `extra.options` only. It does not implement or prove SQL deadlines, pool bounds, HTTP/proxy budgets or cancellation. Preserve the gateway executor's independent changes when composing. SQLite readonly flags, PostgreSQL timeout settings, source precedence and database.module synchronize:false are retained. Shared fixture runners and dependency manifests are unchanged.

Observed socket-fixture limitation: mysql2's server API emits packet sequence warnings while handling the successful handshake/ping. The socket-selection assertion and explicit no-TLS handshake rejection pass; this is not a production SQL/server compatibility claim. The actual TLS tests use MariaDB, not that protocol fixture. The full deadline/image/proxy integration gates remain the responsibility of subsequent composition.
