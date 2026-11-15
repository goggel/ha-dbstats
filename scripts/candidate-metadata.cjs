const fs = require('node:fs');
const assert = require('node:assert/strict');
const yaml = require('../dbstats/app/backend/node_modules/js-yaml');
function metadata(root = '.') {
  const c = yaml.load(fs.readFileSync(`${root}/dbstats-test/config.yaml`, 'utf8'));
  assert.equal(c.name, 'DBStats Test');
  assert.equal(c.slug, 'dbstats_test');
  assert.match(c.version, /^\d+\.\d+\.\d+-rc\.[1-9]\d*$/);
  assert.equal(c.image, 'ghcr.io/goggel/dbstats-test-{arch}');
  assert.deepEqual([...c.arch].sort(), ['aarch64', 'amd64']);
  assert.equal(c.ingress, true);
  assert.equal(c.ingress_port, 6060);
  assert.equal(c.init, false);
  assert.equal(c.ports, undefined);
  assert.equal(c.host_network, undefined);
  assert.deepEqual(c.map, ['homeassistant_config:ro', 'share:ro']);
  assert.ok(!fs.existsSync(`${root}/dbstats-test/Dockerfile`));
  return c;
}
module.exports = metadata;
if (require.main === module) {
  const c = metadata();
  const arch = process.argv[2];
  assert.ok(c.arch.includes(arch));
  console.log(`version=${c.version}\nimage=${c.image.replace('{arch}', arch)}:${c.version}`);
}
