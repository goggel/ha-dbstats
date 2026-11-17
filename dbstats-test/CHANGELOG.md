# Changelog

## 0.6.0-rc.3

- Fix event-domain HTTP 503 errors caused by mixed JSON-type and connection-literal collations in MariaDB/MySQL, including MariaDB's newer UCA defaults. No recorder schema change is required.
- Add regression coverage across connection collations, payload column collations/binary storage and strict SQL modes, preserving Unicode and case-sensitive counts.
- Include the runtime dependency-pruning fix from `4f170dd`.

This version becomes installable after both architecture images pass the manual candidate workflow and are published. Existing candidate tags remain immutable.
