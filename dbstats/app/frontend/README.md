# DBstats frontend

Attribute sizes use the full recorded history by default. Each shared payload is
counted once per entity; payloads shared by different entities appear in each
entity's total, so these are payload totals rather than allocated table sizes.
Charts choose B, KiB, MiB or GiB from their largest value and use that unit for
bars, tooltips and axis ticks. Full-history aggregation can take several minutes
on a large recorder database; timeout and retry behavior still applies.

Click a category label directly in a horizontal chart to copy its full original
text, including labels shortened in the graph. Labels also support keyboard focus
and Enter or Space to copy. A brief message confirms the result. On HTTP Home
Assistant connections, copying falls back to the browser's native copy command.
You can also select the visible label text and use your device's Copy command.

Forked from [this repo](https://github.com/bloomui/tokyo-free-white-react-admin-dashboard.git).

## Quick Start

* Make sure you have the latest stable versions for Node.js and NPM installed. NVM usage recommended.
* Clone repository
* Build shared library: `cd shared && npm ci && npm run build`
* Install dependencies: Run `npm ci` inside the project folder
* Start dev server: After the installation finishes, run `npm start`. A browser window will open on http://localhost:3004 where you''ll see the live preview
* Backend service is expected to be on http://localhost:3000
