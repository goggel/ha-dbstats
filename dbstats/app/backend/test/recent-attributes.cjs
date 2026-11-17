// Real service SQL through QueryGateway, on an isolated database only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {DataSource} = require('typeorm');
const {QueryGateway} = require('../dist/backend/src/query-gateway');
process.env.DB_CONNECT_STRING = process.env.RECENT_URL || 'sqlite://:memory:';
const {StateService} = require('../dist/backend/src/state/state.service');
(async () => {
 const type = process.env.RECENT_DRIVER || 'sqlite';
 const ds = new DataSource(type === 'sqlite' ? {type, database: ':memory:'} : {type, url: process.env.RECENT_URL});
 await ds.initialize();
 try {
 const q = sql => ds.query(sql);
 await q('CREATE TABLE states (state_id INTEGER PRIMARY KEY, metadata_id INTEGER, attributes_id INTEGER)');
 await q('CREATE TABLE states_meta (metadata_id INTEGER PRIMARY KEY, entity_id VARCHAR(100))');
 await q('CREATE TABLE state_attributes (attributes_id INTEGER PRIMARY KEY, shared_attrs TEXT)');
 await q("INSERT INTO states_meta VALUES (1,'sensor.old'),(2,'sensor.recent'),(3,'sensor.shared'),(4,'sensor.null'),(5,'sensor.tiny'),(6,'sensor.below'),(7,'sensor.above')");
 await q(`INSERT INTO state_attributes VALUES (1,'${'x'.repeat(30000)}'),(2,'${'é'.repeat(12000)}'),(3,NULL),(4,'tiny'),(5,'${'x'.repeat(10485)}'),(6,'${'x'.repeat(10486)}')`);
 const gateway = new QueryGateway(ds,{executionMs:8000,acquisitionMs:3000,queueMs:3000,concurrency:1,maxPending:8});
 const service = new StateService(gateway, null, null);
 const recent = () => gateway.runOperation(() => service.countRecentAttributesSize());
 assert.equal((await recent())[0].sampledRows,0);
 await q('INSERT INTO states VALUES (1,2,2),(5,3,2),(9,2,2),(12,99,2),(15,2,99),(19,4,3),(23,5,4),(29,NULL,NULL),(31,6,5),(33,7,6)');
 for(let i=100;i<130;i++){await q(`INSERT INTO states_meta VALUES (${i},'orphan.${i}')`);await q(`INSERT INTO states VALUES (${-i},${i},999)`);}
 let sample=(await recent())[0];
 assert.equal(sample.sampledRows,40);
 const sort = rows => rows.sort((a,b)=>a.type.localeCompare(b.type));
 assert.deepEqual(sort(sample.rows), sort(await gateway.runOperation(()=>service.countAttributesSize())));
 assert.deepEqual(sample.rows.map(r=>r.type).sort(),['sensor.above','sensor.recent','sensor.shared']);
 assert.equal(sample.rows.find(r=>r.type==='sensor.above').cnt,0.01);
 const samples=[];
 let last=33;
 for (const target of [25000,320000]) {
  while(last<target*2) {
   const values=[];
   for(let j=0;j<1000 && last<target*2;j++){last+=2; values.push(`(${last},${last>target*2-40000 ? 2 : 1},${last>target*2-40000 ? 2 : 1})`);}
   await q('INSERT INTO states VALUES '+values.join(','));
  }
  const times={};
  for(const [name,run] of [['recent',recent],['exact',()=>gateway.runOperation(()=>service.countAttributesSize())]]) {
   times[name]=[];
   for(let n=0;n<3;n++){const start=performance.now(); const result=await run();times[name].push(performance.now()-start);if(name==='recent'){assert.equal(result[0].sampledRows,20000);assert.deepEqual(result[0].rows.map(r=>r.type),['sensor.recent']);}else assert(result.some(r=>r.type==='sensor.old'));}
  }
  samples.push({target,times});
 }
 let sql;
 const capture = new StateService({query:async query=>{sql=query; return [{sampled_rows:0,type:null,size:null}];}},null,null);
 await capture.countRecentAttributesSize();
 const plan=await q((type==='mysql' ? 'EXPLAIN FORMAT=JSON ' : type==='postgres' ? 'EXPLAIN (FORMAT JSON) ' : 'EXPLAIN QUERY PLAN ')+sql);
 await q('DELETE FROM states');
 for(let i=10;i<45;i++) {
  await q(`INSERT INTO states_meta VALUES (${i},'sensor.group${i}')`);
  await q(`INSERT INTO state_attributes VALUES (${i},'${'x'.repeat(15000+i)}')`);
  await q(`INSERT INTO states VALUES (${i},${i},${i})`);
 }
 const bounded=(await recent())[0];
 assert.equal(bounded.sampledRows,35);
 const expected=require('../dist/backend/src/config').default().maxRowsInChart;
 assert.equal(bounded.rows.length,expected);
 assert(bounded.rows.every((r,i,a)=>i===0 || a[i-1].cnt>=r.cnt));
 const record={type,samples,plan};
 if(process.env.RECENT_EVIDENCE)fs.writeFileSync(process.env.RECENT_EVIDENCE,JSON.stringify(record,null,2));
 console.log(JSON.stringify({type,samples}));
 } finally {await ds.destroy();}
})().catch(e=>{console.error(e);process.exitCode=1;});
