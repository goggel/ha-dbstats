const engine = process.env.CONTAINER_ENGINE || 'podman';
// Disposable SQL fixtures share an isolated network namespace; no published ports.
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const image = process.argv[2];
assert.ok(image, 'usage: node scripts/test-image-databases.cjs <final-image>');
const prefix = `dbstats-final-sql-${process.pid}`;
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
    const env = [
      'FIXTURE_MYSQL_URL=mysql://dbstats_fixture:disposable_fixture_only@127.0.0.1:33306/dbstats_plan003_fixture',
      'FIXTURE_ORACLE_MYSQL_URL=mysql://dbstats_fixture:disposable_fixture_only@127.0.0.1:33307/dbstats_plan003_fixture',
      'FIXTURE_POSTGRES_URL=postgres://dbstats_fixture:disposable_fixture_only@127.0.0.1:35432/dbstats_plan003_fixture',
    ];
    start(worker, ['--network=none', '-v', `${path.resolve('dbstats/app/backend/test')}:/usr/src/app/test:ro`, ...env.flatMap(e => ['-e', e]), '--entrypoint=node', image, '-e', 'setInterval(()=>{},1000)']);
    const databases = [
      { name: `${prefix}-mariadb`, image: 'docker.io/library/mariadb:11.8', env: ['MARIADB_RANDOM_ROOT_PASSWORD=1', 'MARIADB_DATABASE=dbstats_plan003_fixture', 'MARIADB_USER=dbstats_fixture', 'MARIADB_PASSWORD=disposable_fixture_only'], command: ['--port=33306'], ready: ['mariadb-admin', 'ping', '-h127.0.0.1', '-P33306', '-udbstats_fixture', '-pdisposable_fixture_only'] },
      { name: `${prefix}-postgres`, image: 'docker.io/library/postgres:17', env: ['POSTGRES_DB=dbstats_plan003_fixture', 'POSTGRES_USER=dbstats_fixture', 'POSTGRES_PASSWORD=disposable_fixture_only', 'POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256'], command: ['postgres', '-p', '35432'], ready: ['pg_isready', '-p35432', '-Udbstats_fixture'] },
      { name: `${prefix}-mysql`, image: 'docker.io/library/mysql:8.4', env: ['MYSQL_RANDOM_ROOT_PASSWORD=1', 'MYSQL_DATABASE=dbstats_plan003_fixture', 'MYSQL_USER=dbstats_fixture', 'MYSQL_PASSWORD=disposable_fixture_only'], command: ['--port=33307'], ready: ['mysqladmin', 'ping', '-h127.0.0.1', '-P33307', '-udbstats_fixture', '-pdisposable_fixture_only'] },
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
    console.log(run(['exec', '-e', 'FIXTURE_PHASE=databases', worker, 'node', 'test/integration.cjs']));
    console.log(run(['exec', worker, 'node', 'test/query-deadlines.cjs']));
    console.log(JSON.stringify({ image, fixtures: databases.map(d => d.name), publishedPorts: false, contracts: true, cancellation: true }));
  } finally {
    for (const name of created.reverse()) spawnSync(engine, ['rm', '-f', '--volumes', name], { timeout: 15000, stdio: 'ignore' });
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
