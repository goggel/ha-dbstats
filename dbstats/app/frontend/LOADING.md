The dashboard shares in-flight requests by endpoint and runs expensive requests
in one serial browser lane. Each component owns a subscription; leaving removes
that subscription. When no subscribers remain, unstarted work is removed and
active browser fetches are aborted after one event-loop turn (allowing immediate
effect replay to subscribe again).

REACT_APP_REQUEST_TIMEOUT_MS configures the active fetch and response parsing
budget at build time. The default is 210000ms. Explicit values must be safe
integers from 210000 through 300000ms; invalid values fail visibly at startup.
The server defaults to 180000ms per statement and 190000ms per whole operation
(including 5000ms queue and 5000ms acquisition grace). Combined server settings
above 200000ms are rejected. Nginx read/send timeouts are 205s. Queue wait in the
browser is displayed separately and does not consume its active fetch budget.
Server QUERY_TIMEOUT responses produce a terminal visible timeout with retry;
the next queued chart proceeds and successful sibling charts remain mounted.
Browser abort alone does not establish SQL cancellation.

request(url, options, false) provides an independent lane for inexpensive
metadata only. The imported backend has no health/version endpoint, so no
existing database endpoint is classified as inexpensive. Wire actual metadata
through this lane when its server contract exists.

Run npm test -- --runInBand for component effects and request sharing/cleanup
regressions. Repeat these tests and the fixture browser check on React upgrades.
React 18+ StrictMode verification is deferred until Plan 007.
