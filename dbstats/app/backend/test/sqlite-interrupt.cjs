// Disposable native-driver prerequisite probe. Never opens a supplied path or URI.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const sqlite = require('sqlite3');
const { DataSource } = require('typeorm');
const { QueryGateway } = require('../dist/backend/src/query-gateway');
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
  const gateway = new QueryGateway(ds, { executionMs: 100, acquisitionMs: 1000, queueMs: 1000, concurrency: 4, maxPending: 8 });
  try {
    const slow = 'WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<1000000000) SELECT sum(x) FROM n';
    for (let i = 0; i < 3; i++) {
      const started = Date.now();
      const timed = assert.rejects(gateway.query(slow), e => e.getResponse()?.code === 'QUERY_TIMEOUT');
      const healthy = gateway.query('SELECT value FROM fixture');
      await timed;
      assert.ok(Date.now() - started < 2000, 'Native cancellation exceeded bound');
      assert.equal((await healthy)[0].value, 42);
      await assert.rejects(gateway.query('SELECT missing FROM fixture'));
    }
    await ds.destroy();
    await ds.initialize();
    await assert.rejects(gateway.query(slow), e => e.getResponse()?.code === 'QUERY_TIMEOUT');
    const abort = new AbortController();
    const running = gateway.query(slow, [], abort.signal);
    setTimeout(() => abort.abort(), 30);
    await assert.rejects(running, e => e.getResponse()?.code === 'QUERY_CANCELLED');
    assert.equal((await gateway.query('SELECT value FROM fixture'))[0].value, 42);
    await assert.rejects(gateway.query('INSERT INTO fixture VALUES(43)'), e => e.getResponse?.()?.code === 'QUERY_FAILED');
    await assert.rejects(ds.query('INSERT INTO fixture VALUES(43)'), e => e.driverError?.code === 'SQLITE_READONLY');
    assert.equal(hash(), before);
    console.log('PASS native SQLite interrupt, healthy next query, read-only fixture unchanged');
  } finally { await ds.destroy(); }
})().catch(() => { console.error('FAIL native SQLite interruption prerequisite'); process.exitCode = 1; }).finally(() => fs.rmSync(dir, { recursive: true, force: true }));
