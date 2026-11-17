// Runs only against disposable fixture databases, never HA data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { DataSource } = require('typeorm');
const sqlite = require('sqlite3');
const { validateFixtureUrls } = require('./fixture-targets.cjs');
validateFixtureUrls(process.env);
const phase = process.env.FIXTURE_PHASE || 'all';
assert.ok(['all', 'sqlite', 'http', 'databases'].includes(phase), 'Unknown fixture phase');
const { ConfigService } = require('../dist/backend/src/config.service');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbstats-fixture-'));
const database = path.join(dir, 'fixture.db');
const exec = (db, sql) => new Promise((resolve, reject) => db.exec(sql, e => e ? reject(e) : resolve()));
const request = (url, options = {}) => fetch(url, { signal: AbortSignal.timeout(3000), ...options });
const close = db => new Promise((resolve, reject) => db.close(e => e ? reject(e) : resolve()));
const snapshot = () => Object.fromEntries(fs.readdirSync(dir).map(name => {
  const file = path.join(dir, name), stat = fs.statSync(file);
  return [name, [stat.mtimeMs, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]];
}));
async function read(options) {
  const ds = new DataSource({ ...options, entities: [], synchronize: false, migrationsRun: false });
  await ds.initialize();
  try { assert.equal((await ds.query('SELECT value AS answer FROM fixture'))[0].answer, 42); }
  finally { await ds.destroy(); }
}
(async () => {
  const writer = new sqlite.Database(database);
  let child;
  try {
    await exec(writer, 'PRAGMA journal_mode=WAL; CREATE TABLE fixture(value INTEGER); INSERT INTO fixture VALUES(42);');
    const before = snapshot();
    const shmBefore = fs.readFileSync(database + '-shm');
    if (phase === 'all' || phase === 'sqlite') {
    const options = ConfigService.connectionStringToDatabaseOptions(`sqlite://${database}`);
    assert.equal(options.flags, sqlite.OPEN_READONLY);
    await read(options);
    const ro = new sqlite.Database(database, sqlite.OPEN_READONLY);
    await assert.rejects(exec(ro, 'INSERT INTO fixture VALUES(43)'), /SQLITE_READONLY/);
    await close(ro);
    const after = snapshot();
    assert.deepEqual(Object.keys(after), Object.keys(before));
    if (process.env.FIXTURE_STRICT_WRITABLE === '1') assert.deepEqual(after, before);
    for (const name of ['fixture.db', 'fixture.db-wal']) assert.deepEqual(after[name], before[name]);
    const shmAfter = fs.readFileSync(database + '-shm');
    assert.equal(shmAfter.length, shmBefore.length);
    const changes = Array.from(shmBefore.keys()).filter(i => shmBefore[i] !== shmAfter[i]);
    assert.ok(changes.every(i => i >= 100 && i < 120), `Unexpected SHM changes: ${changes}`);
    console.log('SHM read-mark changed offsets:', changes);
    console.log(`PASS SQLite ${sqlite.VERSION}: native load, WAL read, rejected write, DB/WAL stable; SHM read-mark-only`);
    }
    if (phase === 'sqlite') return;
    if (phase === 'all' || phase === 'http') {
    await exec(writer, 'CREATE TABLE statistics_meta(id INTEGER PRIMARY KEY,statistic_id TEXT); CREATE TABLE statistics_short_term(id INTEGER PRIMARY KEY,metadata_id INTEGER,start_ts REAL);');
    // Hosted runners may already have an index under /var/www/html. Own the
    // static root so these API/middleware 404 assertions do not depend on it.
    const staticRoot = path.join(dir, 'http-static');
    fs.mkdirSync(staticRoot);
    child = spawn(process.execPath, ['dist/backend/src/main.js'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, DB_CONNECT_STRING: `sqlite://${database}`, SERVER_PORT: '31983', DBSTATS_STATIC_ROOT: staticRoot },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let logs = '';
    child.stdout.on('data', chunk => { logs += chunk; });
    child.stderr.on('data', chunk => { logs += chunk; });
    for (let attempt = 0; ; attempt++) {
      try { await request('http://127.0.0.1:31983/addon-api'); break; }
      catch { if (attempt === 100 || child.exitCode !== null) throw Error('HTTP fixture failed to start'); await new Promise(r => setTimeout(r, 100)); }
    }
    const base = 'http://127.0.0.1:31983';
    assert.equal((await request(`${base}/addon-api`)).status, 404);
    assert.equal((await request(`${base}/`)).status, 404);
    assert.equal((await request(`${base}/api`)).status, 200);
    const rows = await request(`${base}/addon-api/system/getTableRows`);
    assert.equal(rows.status, 200);
    assert.ok((await rows.text()).includes('fixture'));
    const storage = await request(`${base}/addon-api/system/getTableStorage`);
    assert.equal(storage.status,200);
    assert.equal((await storage.json()).length,3);
    const overview = await request(`${base}/addon-api/statistic/short/overview?window=day`);
    assert.equal(overview.status,200);
    assert.equal((await overview.json())[0].totalRows,0);
    assert.equal((await request(`${base}/addon-api/statistic/short/overview?window=invalid`)).status,400);
    const days = await request(`${base}/addon-api/statistic/short/days?metadataId=1`);
    assert.equal(days.status,200);
    assert.deepEqual(await days.json(),[]);
    assert.equal((await request(`${base}/addon-api/statistic/short/days?metadataId=0`)).status,400);
    assert.equal((await request(`${base}/addon-api/statistic/short/days?metadataId=1.5`)).status,400);
    assert.equal((await request(`${base}/api-json`)).status, 200);
    assert.equal((await request(`${base}/addon-api/unknown/nested`)).status, 404);
    assert.equal((await request(`${base}/addon-api`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalid' })).status, 404);
    assert.equal((await request(`${base}/addon-api/system/getTableRows?x[a]=1`)).status, 200);
    child.kill('SIGTERM');
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('shutdown timed out')), 5000); child.once('exit', (code, signal) => { clearTimeout(timer); (code === 0 || signal === 'SIGTERM') ? resolve() : reject(Error(`shutdown failed: ${code}/${signal}`)); }); });
    child = null;
    assert.match(logs, /GET \/ 404/);
    assert.match(logs, /GET \/addon-api\/unknown\/nested 404/);
    console.log('PASS HTTP: API prefix, Swagger, nested unknown, invalid body, query, graceful shutdown');
    }
    if (phase === 'http') return;
    if (process.env.FIXTURE_SQLITE_HTTP_ONLY === '1') { console.log('SKIPPED MariaDB/PostgreSQL by explicit fixture subset'); return; }
    for (const [name, variable] of [['MariaDB', 'FIXTURE_MYSQL_URL'], ['PostgreSQL', 'FIXTURE_POSTGRES_URL']]) {
      assert.ok(process.env[variable], `${name} disposable fixture prerequisite missing: ${variable}`);
      const connection = ConfigService.connectionStringToDatabaseOptions(process.env[variable]);
      const rejectedUrl = new URL(connection.url);
      rejectedUrl.password = 'wrong_disposable_password';
      const badAuth = new DataSource({ ...connection, url: rejectedUrl.href, entities: [], synchronize: false, migrationsRun: false });
      try { await assert.rejects(badAuth.initialize()); }
      finally { if (badAuth.isInitialized) await badAuth.destroy(); }
      const ds = new DataSource({ ...connection, entities: [], synchronize: false, migrationsRun: false });
      await ds.initialize();
      try {
        await ds.query('CREATE TEMPORARY TABLE fixture(value INTEGER, big BIGINT, amount DECIMAL(10,2), stamp DATE)');
        await ds.query("INSERT INTO fixture VALUES(42,9007199254740993,12.34,'2026-11-14')");
        const row = (await ds.query('SELECT * FROM fixture'))[0];
        assert.equal(row.value, 42);
        assert.equal(String(row.big), '9007199254740993');
        assert.equal(String(row.amount), '12.34');
        assert.equal(row.stamp instanceof Date ? [row.stamp.getFullYear(), String(row.stamp.getMonth() + 1).padStart(2, '0'), String(row.stamp.getDate()).padStart(2, '0')].join('-') : row.stamp, '2026-11-14');
        await assert.rejects(ds.query('SELECT * FROM missing_fixture_table'));
      } finally { await ds.destroy(); }
      console.log(`PASS ${name} connection/read`);
    }
  } finally {
    if (child) child.kill('SIGKILL');
    await close(writer);
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
