// Parse the actual publisher arguments; no publishing occurs in this check.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const yaml = require('../dbstats/app/backend/node_modules/js-yaml');
const read = (file) => yaml.load(fs.readFileSync(file, 'utf8'));
const config = read('dbstats/config.yaml');
const repo = read('repository.yaml');
const workflow = read('.github/workflows/release.yml');
const job = workflow.jobs.release_db_stats_addon;
const builder = job.steps.find((s) => s.uses?.startsWith('home-assistant/builder@'));
assert.equal(builder.uses, 'home-assistant/builder@2025.11.0');
assert.equal(job.if, "vars.DBSTATS_RUNTIME_IMAGE_VERIFIED == 'true'");
assert.match(builder.with.args, /--docker-hub "ghcr.io\/\$\{\{ github.repository_owner \}\}"/);
assert.match(builder.with.args, /--image "dbstats-addon-\{arch\}"/);
assert.match(builder.with.args, /--target dbstats/);
assert.equal(config.image, 'ghcr.io/goggel/dbstats-addon-{arch}');
assert.equal(repo.url, 'https://github.com/goggel/ha-dbstats');
assert.equal(config.url, `${repo.url}/blob/main/dbstats/README.md`);
for (const file of ['README.MD', 'dbstats/README.md']) {
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(!text.includes('github.com/jehy/hass-addons'));
}
assert.ok(!builder.with.args.includes('jehy'));
const ci = read('.github/workflows/check-app.yml');
assert.ok(ci.on.pull_request === null);
assert.ok(ci.jobs.source.steps.some((s) => s.run === 'sh scripts/check-app.sh'));
console.log('Workflow/config routing agrees: ghcr.io/goggel/dbstats-addon-{arch}; publication gated.');
