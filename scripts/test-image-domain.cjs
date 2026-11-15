const engine = process.env.CONTAINER_ENGINE || 'podman';
// Disposable SQL fixtures share an isolated network namespace; no published ports.
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const image = process.argv[2];
assert.ok(image, 'usage: node scripts/test-image-domain.cjs <final-image>');
const prefix = `dbstats-composed-domain-${process.pid}`;
const worker = `${prefix}-worker`;
const created = [];
function run(args, timeout = 60000) {
  const result = spawnSync(engine, args, { encoding: 'utf8', timeout });
  assert.equal(result.status, 0, result.error?.message || (result.stdout + result.stderr));
  return result.stdout;
}
function start(name, args) {
  run(['run', '-d', '--pull=never', '--name', name, ...args]);
  created.push(name);
}
(async () => {
  try {
    start(worker, ['--network=none', '-v', `${path.resolve('dbstats/app/backend/test')}:/usr/src/app/test:ro`, '-e', 'DOMAIN_IMAGE_FIXTURE=owned-isolated-v1', '--entrypoint=node', image, '-e', 'setInterval(()=>{},1000)']);
    const databases = [
      ...[['mariadb','mariadb:11.8',33618], ['mysql','mysql:8.4',33684]].map(([kind, image, port]) => ({ name: `${prefix}-${kind}`, image: `docker.io/library/${image}`, env: ['MYSQL_ROOT_PASSWORD=domain_fixture_only', 'MYSQL_DATABASE=dbstats_domain_006a'], command: [`--port=${port}`], ready: [kind === 'mariadb' ? 'mariadb-admin' : 'mysqladmin', 'ping', '-h127.0.0.1', `-P${port}`, '-uroot', '-pdomain_fixture_only'] })),
      ...[16,15].map(version => ({ name: `${prefix}-pg${version}`, image: `docker.io/library/postgres:${version}`, env: ['POSTGRES_PASSWORD=domain_fixture_only', 'POSTGRES_DB=dbstats_domain_006a'], command: ['postgres','-p',String(version === 16 ? 35616 : 35615)], ready: ['pg_isready','-Upostgres','-p',String(version === 16 ? 35616 : 35615)] })),
    ];
    for (const db of databases) start(db.name, [`--network=container:${worker}`, ...db.env.flatMap(e => ['-e', e]), db.image, ...db.command]);
    const deadline = Date.now() + 90000;
    let ready = false;
    while (Date.now() < deadline) {
      ready = databases.every(db => spawnSync(engine, ['exec', db.name, ...db.ready], { timeout: 3000, stdio: 'ignore' }).status === 0);
      if (ready) break;
      await new Promise(r => setTimeout(r, 1000));
    }
    assert.ok(ready, 'Disposable SQL readiness');
    console.log(run(['exec', worker, 'node', 'test/domain/app-drivers.cjs'], 240000));
    console.log(JSON.stringify({ image, fixtures: databases.map(d => d.name), publishedPorts: false, domain: true }));
  } finally {
    for (const name of created.reverse()) spawnSync(engine, ['rm', '-f', '--volumes', name], { timeout: 15000, stdio: 'ignore' });
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
