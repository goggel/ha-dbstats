Event-domain diagnosis — 2026-11-17

Confirmed collation failure (1267)
----------------------------------

The reported `ER_CANT_AGGREGATE_2COLLATIONS` / errno 1267 was reproduced through
EventService and QueryGateway on a disposable MariaDB 11.8 instance. The original
query fails with a utf8mb3_unicode_ci connection expression collation; UCA 1400
profiles are included in the regression matrix too. The payload column may still
be utf8mb4: the conflict is the `JSON_TYPE(...) = 'STRING'` comparison, not a reason
to rebuild recorder tables.

`JSON_TYPE` returns a type keyword using utf8mb3_general_ci while the literal
inherits the connection collation. Both operands have equal coercibility, so
MariaDB cannot select a comparison collation. A minimal synthetic reproduction is
`SELECT JSON_TYPE('"light"') = 'STRING'` under a conflicting utf8mb3 connection
collation. A separate native MariaDB 13.0.2 probe reproduced the same code and
passed all 42 column/connection combinations after the change.

The query now compares `CAST(JSON_TYPE(...) AS BINARY)` with `_binary'STRING'`.
Only the ASCII type keyword comparison changes: UTF-8 payload validation,
nonempty string filtering, binary domain grouping, reference counts and tie order
remain unchanged. There is no recorder DDL or connection-wide collation change.

The driver regression now varies connection collations independently of LONGTEXT
unicode/bin and LONGBLOB storage, under normal and strict grouping modes. It keeps
client/results utf8mb4 so Unicode/emoji output remains representable. The same
fixture verifies actual service SQL, read-only access, malformed/binary payloads,
case/trailing-space distinctions, bounded results and timeout recovery. The old
query failed this matrix with the exact reported error before applying the fix.
After the change, the complete driver suite passed on MariaDB 11.8, MySQL 8.4,
PostgreSQL 16 and SQLite, with the expected PostgreSQL 15 unsupported-chart check.
Those runs used current compiled backend JavaScript composed into a disposable
Linux-native dependency runner; they are not substituted for final-image tests.
Backend compilation, all 83 unit tests, lint and candidate metadata checks passed.

Candidate 0.6.0-rc.3 is reserved for this fix; it is installable only after both
architecture images pass and are published. No existing candidate tag is replaced.

Reference: [MariaDB coercibility](https://mariadb.com/docs/server/reference/sql-functions/secondary-functions/information-functions/coercibility)
and [character-set defaults](https://mariadb.com/docs/server/reference/data-types/string-data-types/character-sets/setting-character-sets-and-collations).

Earlier investigation — 2026-11-15
---------------------------------

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
