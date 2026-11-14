# Application provenance

Imported from https://github.com/jehy/hass-dbstats at tag 0.3.23, commit
927ee43f7fe327e0eee2909af73877bd4a44784a. Tag verified with git ls-remote.

UPSTREAM.sha256 records every imported file, including all three package-lock.json
files. Initial copies are byte-for-byte archive contents. LICENSE and
frontend/LICENSE are preserved. No upstream workflows were imported.

Integration status: Dockerfile now builds explicit local source paths using Node 22
and installs native runtime dependencies in the final stage. This wiring is
UNVERIFIED: the legacy runtime's pinned Alpine packages are unavailable.
No application files or npm lockfiles have been changed since the import.
The two six-byte .db files and secrets.yaml files are upstream test fixtures,
not real Home Assistant databases or added credentials.
