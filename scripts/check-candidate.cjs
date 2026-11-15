const fs = require('node:fs');
const assert = require('node:assert/strict');
const yaml = require('../dbstats/app/backend/node_modules/js-yaml');
const metadata = require('./candidate-metadata.cjs');
metadata();
function policy(w) {
  assert.deepEqual(Object.keys(w.on), ['workflow_dispatch']);
  assert.deepEqual(w.permissions, { contents: 'read' });
  assert.equal(w.concurrency['cancel-in-progress'], false);
  const j = w.jobs.candidate;
  assert.deepEqual(j.permissions, { contents: 'read', packages: 'write' });
  assert.equal(j.env.CONTAINER_ENGINE, 'docker');
  assert.deepEqual(j.strategy.matrix.include.map(x => [x.arch, x.platform, x.runner]), [
    ['amd64', 'linux/amd64', 'ubuntu-24.04'], ['aarch64', 'linux/arm64', 'ubuntu-24.04-arm'],
  ]);
  for (const s of j.steps.filter(s => s.uses)) assert.match(s.uses, /@[0-9a-f]{40}$/);
  const steps = j.steps;
  const build = steps.findIndex(s => s.run?.includes('docker buildx build --load'));
  const test = steps.findIndex(s => s.name === 'Test exact image');
  const push = steps.findIndex(s => s.run?.includes('docker push'));
  assert.ok(build >= 0 && test > build && push > test);
  for (const name of ['test-nginx-render', 'test-image', 'test-image-databases', 'test-image-transport', 'test-image-domain'])
    assert.ok(steps[test].run.includes(`node scripts/${name}.cjs "$IMAGE"`));
  assert.ok(!steps[test].if && !steps[test]['continue-on-error']);
  assert.ok(!j['continue-on-error']);
  assert.ok(steps[push].run.indexOf('check-candidate-absent.py') < steps[push].run.indexOf('docker push'));
  assert.ok(steps[push].run.includes('tested-image-id'));
  const commands = steps.map(s => s.run || '').join('\n');
  assert.ok(!/:latest|:stable|gh release|dbstats-addon-|FIXTURE_IMAGE_NATIVE_ONLY/.test(commands));
  assert.equal((commands.match(/docker buildx build/g) || []).length, 1);
}
const workflow = yaml.load(fs.readFileSync('.github/workflows/candidate.yml', 'utf8'));
policy(workflow);
// Exercise policy rejection, rather than merely checking a valid fixture.
for (const mutate of [
  w => { w.on.push = null; },
  w => { w.jobs.candidate.steps.reverse(); },
  w => { w.jobs.candidate.steps.find(s => s.name === 'Test exact image')['continue-on-error'] = true; },
  w => { w.jobs.candidate.steps.find(s => s.name === 'Test exact image').run = 'true'; },
  w => { w.jobs.candidate.steps.at(-1).run += '\ndocker push example:latest'; },
]) {
  const copy = structuredClone(workflow); mutate(copy);
  assert.throws(() => policy(copy));
}
console.log('Candidate metadata, workflow YAML and publication policy passed (including rejection cases).');
