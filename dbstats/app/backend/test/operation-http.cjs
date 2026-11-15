// Named disposable SQLite fixture: accumulated table-loop latency over real SQL.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DataSource } = require('typeorm');
const { NestFactory } = require('@nestjs/core');
const { Module, Controller, Get } = require('@nestjs/common');
const { QueryGateway } = require('../dist/backend/src/query-gateway');
const { OperationInterceptor } = require('../dist/backend/src/operation.interceptor');

(async () => {
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbstats-operation-'));
 const file = path.join(dir, 'fixture.db');
 const ds = new DataSource({ type:'sqlite', database:file, synchronize:false });
 let app;
 try {
  await ds.initialize();
  for (const table of ['one','two','three','four']) await ds.query(`CREATE TABLE ${table}(value INTEGER)`);
  process.env.DB_CONNECT_STRING = `sqlite://${file}`;
  const create = ds.createQueryRunner.bind(ds);
  let calls = 0;
  const wrapped = new WeakSet();
  ds.createQueryRunner = () => {
   const runner = create(); if(wrapped.has(runner)) return runner; wrapped.add(runner); const query = runner.query.bind(runner);
   runner.query = async (...args) => { calls++; await new Promise(r => setTimeout(r, 40)); return query(...args); };
   return runner;
  };
  const gateway = new QueryGateway(ds, {executionMs:90,queueMs:5,acquisitionMs:5,concurrency:1,maxPending:8});
  const { SystemService } = require('../dist/backend/src/system/system.service');
  const service = new SystemService(gateway, {});
  class FixtureController {
   rows() { return service.getTableRows(); }
   healthy() { return gateway.query('SELECT 42 AS cnt'); }
  }
  Controller()(FixtureController);
  for (const name of ['rows','healthy']) Get(name)(FixtureController.prototype,name,Object.getOwnPropertyDescriptor(FixtureController.prototype,name));
  class FixtureModule {}
  Module({controllers:[FixtureController]})(FixtureModule);
  app = await NestFactory.create(FixtureModule, {logger:false});
  app.useGlobalInterceptors(new OperationInterceptor(gateway));
  await app.listen(0,'127.0.0.1');
  const base = await app.getUrl();
  const start = Date.now();
  const response = await fetch(`${base}/rows`);
  assert.equal(response.status,408);
  assert.deepEqual(await response.json(),{code:'QUERY_TIMEOUT',message:'Database query deadline exceeded',metricId:'FixtureController.rows'});
  assert.ok(Date.now()-start < 1000);
  assert.equal(calls,3,'Expired operation must not start remaining table queries');
  assert.deepEqual(await (await fetch(`${base}/healthy`)).json(),[{cnt:42}]);
  console.log('PASS HTTP multi-query SQLite operation deadline, stable metric error, healthy next metric');
 } finally { await app?.close(); if(ds.isInitialized) await ds.destroy(); fs.rmSync(dir,{recursive:true,force:true}); }
})().catch(e => { console.error('FAIL operation HTTP fixture', e.message); process.exitCode=1; });
