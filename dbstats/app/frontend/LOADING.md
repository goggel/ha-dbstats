The dashboard shares in-flight requests by endpoint and runs expensive requests
in one serial browser lane. Each component owns a subscription; leaving removes
that subscription. When no subscribers remain, unstarted work is removed and
active browser fetches are aborted after one event-loop turn (allowing immediate
effect replay to subscribe again).

REACT_APP_REQUEST_TIMEOUT_MS configures the active fetch and response parsing
budget at build time. The default is 210000ms. Values must exceed 190000ms to
allow the initial 180000ms server budget plus 10000ms transport grace; invalid
values use the default. Queue wait is displayed separately and does not consume
this active request budget. Coordinate increases to the server budget with this
setting. This browser timeout/abort is not SQL cancellation; server enforcement
belongs to Plan 004. The serial lane bounds browser requests, not orphaned SQL.

request(url, options, false) provides an independent lane for inexpensive
metadata only. The imported backend has no health/version endpoint, so no
existing database endpoint is classified as inexpensive. Wire actual metadata
through this lane when its server contract exists.

Run npm test -- --runInBand for component effects and request sharing/cleanup
regressions. Repeat these tests and the fixture browser check on React upgrades.
React 18+ StrictMode verification is deferred until Plan 007.
