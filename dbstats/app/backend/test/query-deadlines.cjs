const assert = require('node:assert/strict');
const { DataSource } = require('typeorm');
const { QueryGateway } = require('../dist/backend/src/query-gateway');
const { validateFixtureUrls } = require('./fixture-targets.cjs');
validateFixtureUrls(process.env);
(async () => {
 for (const [key, type] of [['FIXTURE_MYSQL_URL','mysql'],['FIXTURE_ORACLE_MYSQL_URL','mysql'],['FIXTURE_POSTGRES_URL','postgres']]) {
  assert.ok(process.env[key], `Missing disposable ${key}`);
  const ds = new DataSource({type, url: process.env[key], synchronize:false, migrationsRun:false, extra: type === 'postgres' ? {max:2,connectionTimeoutMillis:1000} : {connectionLimit:2,waitForConnections:false,connectTimeout:1000}});
  await ds.initialize();
  try {
   const errors=[];
   const createRunner=ds.createQueryRunner.bind(ds);
   ds.createQueryRunner=(...args)=> {
    const runner=createRunner(...args);
    const query=runner.query.bind(runner);
    runner.query=async(...args)=> { try{return await query(...args);}catch(error){ errors.push(error.driverError);throw error;} };
    return runner;
   };
   const gateway = new QueryGateway(ds,{executionMs:100,acquisitionMs:1000,queueMs:2000,concurrency:2,maxPending:8});
   const version = type === 'mysql' ? (await ds.query('SELECT VERSION() AS version'))[0].version : '';
   const maria = /mariadb/i.test(version);
   const slow = type === 'postgres' ? 'SELECT sum(i) FROM generate_series(1,1000000000) i' : 'WITH RECURSIVE n AS (SELECT 1 AS x UNION ALL SELECT x+1 FROM n WHERE x<1000) SELECT sum(a.x*b.x*c.x*d.x) FROM n a CROSS JOIN n b CROSS JOIN n c CROSS JOIN n d';
   for(let batch=0;batch<3;batch++) {
    const started=Date.now();
    await Promise.all([0,1].map(async()=> {
     await assert.rejects(gateway.query(slow), e=>{ if(e.getResponse?.()?.code==='QUERY_TIMEOUT')return true; console.error('Unexpected fixture error',e.driverError?.code,e.driverError?.errno,e.message); return false; });
     assert.equal(Number((await gateway.query('SELECT 42 AS value'))[0].value),42);
     await assert.rejects(gateway.query('SELECT * FROM dbstats_missing_fixture_table'));
    }));
    assert.ok(Date.now()-started<4000,'Server cancellation exceeded bound');
    const active = type === 'postgres' ? await ds.query("SELECT query FROM pg_stat_activity WHERE datname=current_database() AND state='active' AND pid<>pg_backend_pid()") : await ds.query("SELECT INFO FROM information_schema.PROCESSLIST WHERE DB=DATABASE() AND COMMAND='Query' AND ID<>CONNECTION_ID()");
    assert.equal(active.length,0,'Orphan active query');
   }
   assert.ok(errors.some(e=>type==='postgres'?e?.code==='57014':maria?e?.errno===1969:e?.code==='ER_QUERY_TIMEOUT'),'Expected native/server timeout code');
   const controller=new AbortController();
   const aborted=gateway.query(slow,[],controller.signal);
   setTimeout(()=>controller.abort(),20);
   await assert.rejects(aborted,e=>e.getResponse?.()?.code==='QUERY_CANCELLED');
   assert.equal(Number((await gateway.query('SELECT 42 AS value'))[0].value),42);
   // Destroy idle physical sessions to force replacement initialization.
   if(type==='mysql') {
    const pool=ds.driver.pool;
    for(const connection of [...pool._allConnections.toArray()]) connection.destroy();
   } else {
    const count=ds.driver.master.totalCount;
    for(let i=0;i<count;i++) { const client=await ds.driver.master.connect(); client.release(true); }
   }
   await assert.rejects(gateway.query(slow), e=>{ if(e.getResponse?.()?.code==='QUERY_TIMEOUT')return true; console.error('Unexpected fixture error',e.driverError?.code,e.driverError?.errno,e.message); return false; });
   assert.equal(Number((await gateway.query('SELECT 42 AS value'))[0].value),42);
   if(type==='mysql') assert.equal(ds.driver.pool._allConnections.length,ds.driver.pool._freeConnections.length);
   else assert.equal(ds.driver.master.totalCount,ds.driver.master.idleCount);
   console.log(`PASS gateway ${type==='postgres'?'PostgreSQL':maria?'MariaDB':'MySQL'} real timeout, two sessions, replacement, healthy query and resource baseline`);
  } finally {await ds.destroy();}
 }
})().catch(e=>{console.error(e);process.exitCode=1});
