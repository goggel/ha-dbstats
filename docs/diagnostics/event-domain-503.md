Event-domain diagnosis — 2026-11-15

Base: master f9bf42c. Live HTTP 503 was NOT reproduced. No production database, push, PR, merge or deployment was used.

Confirmed separate defect: binary payload storage loses domain semantics. Original MariaDB 11.8 LONGBLOB splits literal UTF-8 and escaped Unicode into different groups, with mojibake for the literal form. The deep equality regression assertion failed. Original MySQL 8.4 returns [] for the same binary fixture. Neither produced HTTP 503. HA-like LONGTEXT utf8mb4_bin passes before the fix, including ONLY_FULL_GROUP_BY. Strict grouping/order is therefore unconfirmed as the live cause.

The fix explicitly interprets recorder bytes as utf8mb4 before JSON validation/extraction, with a byte round-trip guard rejecting lossy conversion. JSON validity, nonempty string filtering, case/whitespace/Unicode, bytewise grouping/order and bounded aggregates remain enforced. No database strict mode is weakened. run-engines.py appends flags rather than replacing engine defaults.

Regression matrix in app-drivers.cjs exercises LONGTEXT utf8mb4_unicode_ci, LONGTEXT utf8mb4_bin and LONGBLOB with default and default-plus-ONLY_FULL_GROUP_BY/STRICT_TRANS_TABLES modes. Binary fixtures include invalid UTF-8 inside a domain and malformed binary JSON. Original malformed/null/nonstring cases remain. Before: MariaDB binary assertion failed and MySQL binary probe returned []. After: all equality checks pass.

Validation:
- Backend lint:check -- --max-warnings=0 and build passed.
- Backend test -- --runInBand: 8 suites, 69 tests passed.
- Native application matrix: SQLite, MariaDB 11.8.9, MySQL 8.4.13, PostgreSQL 16 and PG15 compatibility passed. Includes 100 references=100, case/space/Unicode, limits, timeout/recovery and empty input.
- python3 test/domain/run-engines.py passed SQLite, MariaDB 11.8.9, MySQL 8.4.13 and PostgreSQL 16.16 with strict grouping retained.
- Application matrix used scripts/test-image-domain.cjs through docker and existing localhost/dbstats-native-stage:arm64, with newly built backend dist mounted read-only over /usr/src/app/dist via a temporary runner copy. Dependencies came from the image; SQL came from this tree. Owned fixture containers share an isolated namespace without published ports and are removed in finally blocks.
- git diff --check passed.

TypeORM and QueryGateway now log only a fixed allowlist of driver code names, bounded numeric errno and five-character protocol sqlState identifiers. Unknown code names are omitted. Messages, SQL, parameters and credentials are never serialized; HTTP failures stay generic. Tests verify both logging boundaries and wrapped TypeORM errors using secret/SQL/message canaries and malformed identifiers.

After parent review and any separately authorized rollout, needed user evidence is a retry's new TypeORM/QueryGateway identifier line, recorder engine/version and session sql_mode, and column type/charset/collation metadata for event_data.shared_data. Do not request payloads, credentials, connection URIs or full query errors. Until then charset/schema differences, version behavior, missing columns/permissions and other driver errors remain hypotheses. No claim is made that the live HTTP503 is fixed.
