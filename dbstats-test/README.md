# DBStats Test

This prebuilt-only add-on uses the single owned application in `dbstats/`. Candidate
version `0.6.0-rc.2` selects matching tags in `ghcr.io/goggel/dbstats-test-amd64`
and `ghcr.io/goggel/dbstats-test-aarch64`. The stable **DbStats** entry remains
independently installable. The test entry exposes only authenticated HA ingress;
there is no host port mapping. Recorder mounts remain read-only.

The event-domain chart supports PostgreSQL **16+** only (plus supported MySQL and
MariaDB). PostgreSQL 15 receives the unsupported-chart behavior checked by fixtures.
Start with a recorder database copy and a database account restricted to reading.

## Publish a reviewed candidate

1. Review and merge the candidate PR into `master`. A push does not publish images.
   The manual workflow must exist on the default branch before UI dispatch works.
2. In Actions, select **Publish reviewed candidate**, choose **Run workflow**, and
   select the reviewed ref containing the intended metadata version (initially
   `master` / `0.6.0-rc.2`). Record its source SHA. There is no arbitrary image or
   version input: the checked-out `dbstats-test/config.yaml` controls both.
3. Wait for both native architecture jobs and inspect their tag/digest/source SHA
   summaries. Each builds once, runs source/frontend checks and all five image
   suites, and pushes that exact artifact using the job's `GITHUB_TOKEN`.
4. After first publication, open each package's settings on GitHub and change
   visibility to **public** if necessary. Public repository visibility alone does
   not guarantee public package visibility. HA requires anonymous image pulls.
   Package administration is deliberately a user action; no personal token is needed
   in this repository. Existing packages may need repository Actions write access.
5. In HA Settings → Add-ons → Add-on store → Repositories, add
   `https://github.com/goggel/ha-dbstats`, reload the store, and install **DBStats Test**.
   The entry appears after merging to the default branch; wait for both images to
   be available and public before installation. Configure `connectionString` for
   the recorder copy (or leave empty to discover recorder settings), start the
   add-on, enable its sidebar entry, and open it.

Candidate versions are immutable by policy. The workflow serializes publishing
runs and refuses an existing tag. To try new code, commit a new `-rc.N` version,
review/merge and dispatch again. If only one architecture published, installed
users retain that image: use a new version for both architectures rather than
rerunning to overwrite the partial version. Registry/authentication errors fail
closed. External writers must also respect this policy; GHCR itself does not
provide a repository-wide immutable-tag guarantee.

No stable/latest tag, release, stable publish gate or HA deployment is changed.
No actual GitHub-hosted workflow or HA deployment has been performed locally.

References: [native runner labels](https://docs.github.com/en/actions/reference/runners/github-hosted-runners),
[manual dispatch](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow),
[GHCR authentication and visibility](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry),
[HA configuration](https://developers.home-assistant.io/docs/apps/configuration/).
