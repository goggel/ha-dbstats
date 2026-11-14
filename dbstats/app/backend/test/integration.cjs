// Runs only against disposable fixture databases, never HA data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { DataSource } = require('typeorm');
const sqlite = require('sqlite3');
const { ConfigService } = require('../dist/backend/src/config.service');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbstats-fixture-'));
const database = path.join(dir, 'fixture.db');
const exec = (db, sql) => new Promise((resolve, reject) => db.exec(sql, e => e ? reject(e) : resolve()));
const close = db => new Promise((resolve, reject) => db.close(e => e ? reject(e) : resolve()));
const snapshot = () => Object.fromEntries(fs.readdirSync(dir).map(name => {
  const file = path.join(dir, name), stat = fs.statSync(file);
  return [name, [stat.mtimeMs, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]];
}));
async function read(options) {
  const ds = new DataSource({ ...options, entities: [], synchronize: false, migrationsRun: false });
  await ds.initialize();
  try { assert.equal((await ds.query('SELECT 42 AS answer'))[0].answer, 42); }
  finally { await ds.destroy(); }
}
(async () => {
  const writer = new sqlite.Database(database);
  let child;
  try {
    await exec(writer, 'PRAGMA journal_mode=WAL; CREATE TABLE fixture(value INTEGER); INSERT INTO fixture VALUES(42);');
    const before = snapshot();
    const options = ConfigService.connectionStringToDatabaseOptions(`sqlite://${database}`);
    assert.equal(options.flags, sqlite.OPEN_READONLY);
    await read(options);
    const ro = new sqlite.Database(database, sqlite.OPEN_READONLY);
    await assert.rejects(exec(ro, 'INSERT INTO fixture VALUES(43)'), /SQLITE_READONLY/);
    await close(ro);
    assert.deepEqual(snapshot(), before);
    console.log(`PASS SQLite ${sqlite.VERSION}: native load, WAL read, rejected write, hashes/mtimes unchanged`);
    child = spawn(process.execPath, ['dist/backend/src/main.js'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, DB_CONNECT_STRING: `sqlite://${database}`, SERVER_PORT: '31983' },
      stdio: 'ignore',
    });
    for (let attempt = 0; ; attempt++) {
      try { await fetch('http://127.0.0.1:31983/addon-api'); break; }
      catch { if (attempt === 100 || child.exitCode !== null) throw Error('HTTP fixture failed to start'); await new Promise(r => setTimeout(r, 100)); }
    }
    const base = 'http://127.0.0.1:31983';
    assert.equal(await (await fetch(`${base}/addon-api`)).text(), 'Hello');
    assert.equal((await fetch(`${base}/api-json`)).status, 200);
    assert.equal((await fetch(`${base}/addon-api/unknown/nested`)).status, 404);
    assert.equal((await fetch(`${base}/addon-api`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalid' })).status, 404);
    assert.equal((await fetch(`${base}/addon-api?x[a]=1`)).status, 200);
    child.kill('SIGTERM');
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('shutdown timed out')), 5000); child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(Error('shutdown failed')); }); });
    child = null;
    assert.deepEqual(snapshot(), before);
    console.log('PASS HTTP: API prefix, Swagger, nested unknown, invalid body, query, graceful shutdown');
    if (process.env.FIXTURE_SQLITE_HTTP_ONLY === '1') { console.log('SKIPPED MariaDB/PostgreSQL by explicit fixture subset'); return; }
    for (const [name, variable] of [['MariaDB', 'FIXTURE_MYSQL_URL'], ['PostgreSQL', 'FIXTURE_POSTGRES_URL']]) {
      assert.ok(process.env[variable], `${name} disposable fixture prerequisite missing: ${variable}`);
      await read(ConfigService.connectionStringToDatabaseOptions(process.env[variable]));
      console.log(`PASS ${name} connection/read`);
    }
  } finally {
    if (child) child.kill('SIGKILL');
    await close(writer);
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
