// Fixed, disposable targets only. Never accepts application URLs or external targets.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DataSource } = require('typeorm');
const sqlite = require('sqlite3');
const { QueryGateway } = require('../../dist/backend/src/query-gateway');
require.cache[require.resolve('../../dist/backend/src/config')] = { exports: { default: () => ({ maxRowsInChart: 10 }) } };
const { EventService } = require('../../dist/backend/src/event/event.service');
const podman = args => {
  const r = spawnSync('/opt/homebrew/bin/podman', ['--connection', 'podman-machine-default', ...args], { timeout: 30000, encoding: 'utf8' });
  if (r.status !== 0) throw Object.assign(Error('Disposable container command failed'), { operation: args[0], exitStatus: r.status, signal: r.signal, commandCode: r.error?.code, timedOut: r.error?.code === 'ETIMEDOUT' });
  return r.stdout;
};
const budgets = { executionMs: 2000, acquisitionMs: 2000, queueMs: 1000, concurrency: 1, maxPending: 4 };
const payloads = ['{"domain":"light"}', '{}', '{bad', '{"domain":null}', '{"domain":12}', '{"domain":false}', '{"domain":[]}', '{"domain":{}}', '{"domain":""}', '{"domain":"温度😀"}', '{"domain":"A"}', '{"domain":"a"}', '{"domain":"a "}', null, '{"domain":" "}', '{"domain":"\\u6e29\\u5ea6\\ud83d\\ude00"}'];
payloads[0] = JSON.stringify({domain: 'light', padding: 'x'.repeat(1024 * 1024)});
const refs = [...Array(100).fill(1), ...payloads.map((_, i) => i + 1).slice(1), null, 999];
const expected = [['light', 100], ['温度😀', 2], [' ', 1], ['A', 1], ['a', 1], ['a ', 1]];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbstats-domain-app-'));
let ownedContainer;
let phase = 'start';
const watchdog = setTimeout(() => { console.error('Domain fixture deadline exceeded'); if (ownedContainer) podman(['rm','-f',ownedContainer]); fs.rmSync(dir,{recursive:true,force:true}); process.exit(1); }, 240000);
async function fixture(type, options) {
  assert.equal(options.database, type === 'sqlite' ? path.join(dir, 'dbstats_domain_006a.sqlite') : 'dbstats_domain_006a');
  if (type !== 'sqlite') { assert.equal(options.host, '127.0.0.1'); assert.ok([33618, 33684, 35616, 35615].includes(options.port)); }
  const setup = new DataSource({ type, ...options, entities: [], synchronize: false, migrationsRun: false });
  phase = `${type}:${options.port || 'native'}:setup-connect`;
  // Container-local readiness may precede host port forwarding. Retry only
  // connection acquisition, before any fixture DDL or inserts have occurred.
  for (let attempt = 0; ; attempt++) {
    try { await setup.initialize(); break; }
    catch (error) {
      if (type === 'sqlite' || attempt >= 19) throw error;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  phase = `${type}:${options.port || 'native'}:setup-schema`;
  let source;
  try {
    if (type === 'sqlite') await setup.query('PRAGMA journal_mode=WAL');
    await setup.query(`CREATE TABLE event_data(data_id INTEGER PRIMARY KEY, shared_data ${type === 'mysql' || type === 'mariadb' ? 'LONGTEXT' : 'TEXT'})`);
    await setup.query('CREATE TABLE events(event_id INTEGER PRIMARY KEY, data_id INTEGER, event_type_id INTEGER DEFAULT 1)');
    await setup.query('CREATE TABLE event_types(event_type_id INTEGER PRIMARY KEY, event_type TEXT)');
    await setup.query("INSERT INTO event_types VALUES (1, 'fixture_event')");
    const args = type === 'postgres' ? '$1,$2' : '?,?';
    for (const [i, payload] of payloads.entries()) await setup.query(`INSERT INTO event_data VALUES (${args})`, [i + 1, payload]);
    for (const [i, ref] of refs.entries()) await setup.query(`INSERT INTO events(event_id, data_id) VALUES (${args})`, [i + 1, ref]);
    await setup.query(`INSERT INTO event_data VALUES (${args})`, [9999, '{"domain":"unused"}']);
    if (type === 'mysql' || type === 'mariadb') {
      await setup.query("CREATE USER 'domain_reader'@'%' IDENTIFIED BY 'domain_reader_fixture_only'");
      await setup.query("GRANT SELECT ON dbstats_domain_006a.* TO 'domain_reader'@'%'");
    }
    source = new DataSource({ type, ...options, ...(type === 'sqlite' ? { flags: sqlite.OPEN_READONLY } : type === 'postgres' ? { extra: { options: '-c default_transaction_read_only=on' } } : { username: 'domain_reader', password: 'domain_reader_fixture_only' }), entities: type === 'postgres' ? ['Events', 'EventTypes', 'EventData'].map(name => require(`../../dist/backend/src/entities/homeass/2024.1.5/${name}`)[name]) : [], synchronize: false, migrationsRun: false });
    phase = `${type}:${options.port || 'native'}:reader-connect`;
    await source.initialize();
    phase = `${type}:${options.port || 'native'}:assertions`;
    const gateway = new QueryGateway(source, budgets);
    const service = new EventService(gateway, { manager: { connection: source } }, {});
    if (options.port === 35615) {
      await assert.rejects(service.countEventsByDomain(), e => e.getResponse().code === 'DOMAIN_JSON_COMPATIBILITY' && /requires PostgreSQL 16 or newer/.test(e.getResponse().message));
      // Exercise an unaffected metric through its real repository and gateway.
      const { Events } = require('../../dist/backend/src/entities/homeass/2024.1.5/Events');
      const unaffected = new EventService(gateway, source.getRepository(Events), {});
      assert.equal(Number((await unaffected.countEventTypes())[0].cnt), refs.length);
      console.log('PASS PostgreSQL 15 unsupported-version message and event-type metric'); return;
    }
    if (type === 'mysql' || type === 'mariadb') {
      const defaultMode = (await setup.query('SELECT @@GLOBAL.sql_mode AS mode'))[0].mode;
      for (const column of ['LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', 'LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin', 'LONGBLOB']) {
        await setup.query(`ALTER TABLE event_data MODIFY shared_data ${column}`);
        if (column === 'LONGBLOB') {
          await setup.query("INSERT INTO event_data VALUES (2000, X'7B22646F6D61696E223A22FF227D'), (2001, X'FF00')");
          await setup.query('INSERT INTO events(event_id, data_id) VALUES (2000,2000), (2001,2001)');
        }
        for (const mode of [defaultMode, [...new Set([...defaultMode.split(','), 'ONLY_FULL_GROUP_BY', 'STRICT_TRANS_TABLES'])].join(',')]) {
          await gateway.query('SET SESSION sql_mode = ?', [mode]);
          phase = `${type}:${column}:${mode}`;
          assert.deepEqual((await service.countEventsByDomain()).map(r => [r.type, Number(r.cnt)]), expected);
          console.log(`PASS ${phase}`);
        }
      }
    }
    if (type === 'mysql' || type === 'mariadb') await setup.query('DELETE FROM event_data WHERE data_id IN (2000,2001)');
    if (type === 'mysql' || type === 'mariadb') await setup.query('ALTER TABLE event_data MODIFY shared_data LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin');
    const rows = await service.countEventsByDomain();
    assert.ok(JSON.stringify(rows).length < 1024, 'No payload hydration in returned aggregates');
    assert.deepEqual(rows.map(r => [r.type, Number(r.cnt)]), expected);
    console.log(`PASS ${type}: 100 references; strings/Unicode/case/space/ties; raw count types ${[...new Set(rows.map(r => typeof r.cnt))]}`);
    if (type === 'sqlite') await assert.rejects(source.query('DELETE FROM events'), /SQLITE_READONLY/);
    // PG json text accepts these syntactically, but extraction must never throw.
    if (type === 'postgres') {
      for (const [i, value] of ['{"domain":"\\u0000"}', '{"domain":"\\ud800"}', '{"domain":"\\udc00"}', '{"domain":"ok","other":"\\u0000"}'].entries()) {
        await setup.query(`INSERT INTO event_data VALUES (${args})`, [1000+i, value]);
        await setup.query(`INSERT INTO events(event_id, data_id) VALUES (${args})`, [1000+i, 1000+i]);
      }
      assert.deepEqual((await service.countEventsByDomain()).map(r => [r.type, Number(r.cnt)]), expected);
    }
    const { domainQuery } = require('../../dist/backend/src/event/domain/domain-query');
    assert.equal((await gateway.query(domainQuery(type, 2))).length, 2);
    const slow = type === 'postgres' ? 'SELECT pg_sleep(5)' : type === 'sqlite' ? 'WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<100000000) SELECT sum(x) FROM n' : 'SELECT SLEEP(5)';
    // MySQL SLEEP is not governed by max_execution_time; use recursive cross product instead.
    const mysqlSlow = 'WITH RECURSIVE n AS (SELECT 1 x UNION ALL SELECT x+1 FROM n WHERE x<1000) SELECT SUM(a.x*b.x*c.x) FROM n a CROSS JOIN n b CROSS JOIN n c';
    const short = new QueryGateway(source, { ...budgets, executionMs: 100 });
    await assert.rejects(short.query(type === 'mysql' ? mysqlSlow : slow), e => e.getResponse().code === 'QUERY_TIMEOUT');
    assert.equal(Number((await gateway.query('SELECT 42 AS answer'))[0].answer), 42);
    await setup.query('DELETE FROM events');
    assert.deepEqual(await service.countEventsByDomain(), []);
    console.log(`PASS ${type}: bounded rows, timeout/recovery, empty`);
  } finally { if (source?.isInitialized) await source.destroy(); await setup.destroy(); }
}
(async () => {
  await fixture('sqlite', { database: path.join(dir, 'dbstats_domain_006a.sqlite') });
  if (process.env.DOMAIN_IMAGE_FIXTURE === 'owned-isolated-v1') {
    for (const [type, port] of [['mariadb',33618], ['mysql',33684], ['postgres',35616], ['postgres',35615]])
      await fixture(type, { host:'127.0.0.1', port, username:type === 'postgres' ? 'postgres' : 'root', password:'domain_fixture_only', database:'dbstats_domain_006a', ...(type === 'mysql' || type === 'mariadb' ? { charset:'utf8mb4' } : {}), connectTimeoutMS:2000 });
    return;
  }
  for (const [type, image, port] of [['mariadb','mariadb:11.8',33618], ['mysql','mysql:8.4',33684], ['postgres','postgres:16',35616], ['postgres','postgres:15',35615]]) {
    const name = `dbstats-domain-app-006a-${port}`;
    // run fails if another executor owns this exact name; never remove on failed creation.
    phase = `${type}:${port}:container-create`;
    podman(['run','-d','--name',name,'-p',`127.0.0.1:${port}:${type === 'postgres' ? 5432 : 3306}`, '-e', type === 'postgres' ? 'POSTGRES_PASSWORD=domain_fixture_only' : 'MYSQL_ROOT_PASSWORD=domain_fixture_only', '-e', type === 'postgres' ? 'POSTGRES_DB=dbstats_domain_006a' : 'MYSQL_DATABASE=dbstats_domain_006a', image]);
    ownedContainer = name;
    try {
      let ready = false;
      for (let n=0;n<60;n++) {
        try { podman(['exec',name, ...(type === 'postgres' ? ['pg_isready','-h','127.0.0.1','-U','postgres'] : [type === 'mariadb' ? 'mariadb-admin' : 'mysqladmin','ping','-h','127.0.0.1','-uroot','-pdomain_fixture_only','--silent'])]); ready=true; break; } catch { await new Promise(r => setTimeout(r, 500)); }
      }
      assert.ok(ready, 'Disposable fixture readiness timed out');
      await fixture(type, { host:'127.0.0.1', port, username:type === 'postgres' ? 'postgres' : 'root', password:'domain_fixture_only', database:'dbstats_domain_006a', ...(type === 'mysql' || type === 'mariadb' ? { charset:'utf8mb4' } : {}), connectTimeoutMS:2000 });
    } finally { podman(['rm','-f',name]); ownedContainer = undefined; }
  }
})().catch(e => { console.error('FAIL domain app-driver fixture', { phase, causes: e.errors?.slice(0, 4).map(c => ({ code: c.code, syscall: c.syscall })), operation: e.operation, exitStatus: e.exitStatus, signal: e.signal, timedOut: e.timedOut, commandCode: e.commandCode, code: e.code, driverCode: e.driverError?.code, assertion: e.operator, frames: e.stack?.split('\n').filter(line => line.includes('app-drivers.cjs')) }); process.exitCode=1; }).finally(() => { clearTimeout(watchdog); fs.rmSync(dir,{recursive:true,force:true}); });
