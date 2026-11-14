// Disposable native-driver prerequisite probe. Never opens a supplied path or URI.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const sqlite = require('sqlite3');
const { DataSource } = require('typeorm');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbstats-interrupt-'));
const file = path.join(dir, 'fixture.db');
const hash = () => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
(async () => {
  const writer = new sqlite.Database(file);
  await new Promise((resolve, reject) => writer.exec('CREATE TABLE fixture(value); INSERT INTO fixture VALUES(42)', e => e ? reject(e) : resolve()));
  await new Promise((resolve, reject) => writer.close(e => e ? reject(e) : resolve()));
  const before = hash();
  const ds = new DataSource({ type: 'sqlite', database: file, flags: sqlite.OPEN_READONLY, synchronize: false, migrationsRun: false });
  await ds.initialize();
  const runner = ds.createQueryRunner();
  try {
    // QueryRunner.connect returns the native sqlite3 handle for this pinned driver.
    const handle = await runner.connect();
    assert.equal(typeof handle.interrupt, 'function');
    const started = Date.now();
    const timer = setTimeout(() => handle.interrupt(), 100);
    try {
      await assert.rejects(runner.query('WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<1000000000) SELECT sum(x) FROM n'), e => e.driverError?.code === 'SQLITE_INTERRUPT');
    } finally { clearTimeout(timer); }
    assert.ok(Date.now() - started < 2000, 'Native cancellation exceeded bound');
    assert.equal((await runner.query('SELECT value FROM fixture'))[0].value, 42);
    await assert.rejects(runner.query('INSERT INTO fixture VALUES(43)'), e => e.driverError?.code === 'SQLITE_READONLY');
    assert.equal(hash(), before);
    console.log('PASS native SQLite interrupt, healthy next query, read-only fixture unchanged');
  } finally { await runner.release(); await ds.destroy(); }
})().catch(() => { console.error('FAIL native SQLite interruption prerequisite'); process.exitCode = 1; }).finally(() => fs.rmSync(dir, { recursive: true, force: true }));
