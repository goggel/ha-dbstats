// Real SQL over owned disposable fixtures only. Can be reused by the driver matrix.
const assert = require('node:assert/strict');
const {DataSource} = require('typeorm');
const {QueryGateway} = require('../dist/backend/src/query-gateway');
const {tableStorage} = require('../dist/backend/src/system/table-storage');
const {statisticsOverview,statisticDays,coverageBounds} = require('../dist/backend/src/statistic/coverage');
const now = Date.UTC(2026,10,17,12,10);
const end = now/1000-600, start=end-86400;
async function check(source) {
  const gateway = new QueryGateway(source,{executionMs:10000,acquisitionMs:3000,queueMs:3000,concurrency:1,maxPending:8});
  const q = (sql,params) => source.query(sql,params);
  if(['mysql','mariadb'].includes(source.options.type)) await q("SET SESSION sql_mode=CONCAT_WS(',',NULLIF(@@sql_mode,''),'ONLY_FULL_GROUP_BY')");
  await q('CREATE TABLE statistics_meta(id INTEGER PRIMARY KEY,statistic_id VARCHAR(100))');
  await q('CREATE TABLE statistics_short_term(id INTEGER PRIMARY KEY,metadata_id INTEGER,start_ts DOUBLE PRECISION)');
  await q('CREATE UNIQUE INDEX ix_statistics_short_term_statistic_id_start_ts ON statistics_short_term(metadata_id,start_ts)');
  await q("INSERT INTO statistics_meta VALUES (1,'sensor.complete'),(2,'sensor.gaps'),(3,'sensor.stale'),(4,'sensor.new'),(5,'sensor.no_timestamp'),(6,'sensor.compiling')");
  let id=0;
  const values=[];
  for(let i=0;i<288;i++) {
    values.push(`(${++id},1,${start+i*300})`);
    if(i!==100) values.push(`(${++id},2,${start+i*300})`);
  }
  values.push(`(${++id},2,${end-604800-300})`,`(${++id},3,${start-300})`,`(${++id},5,NULL)`,`(${++id},999,${end-300})`,`(${++id},6,${end+300})`);
  for(let i=1;i<=3;i++) values.push(`(${++id},4,${end-i*300})`);
  await q('INSERT INTO statistics_short_term VALUES '+values.join(','));
  const [overview] = await statisticsOverview(gateway,'day',now);
  const byId = Object.fromEntries(overview.series.map(row=>[row.metadataId,row]));
  assert.equal(overview.totalRows,id);
  assert.equal(overview.statisticCount,6);
  assert.equal(overview.oldestTs,end-604800-300);
  assert.equal(byId[1].coverage,100);
  assert.equal(byId[2].missing,1);
  assert.equal(byId[2].status,'gaps');
  assert.equal(byId[3].missing,288);
  assert.equal(byId[3].status,'no_recent_data');
  assert.equal(byId[4].expected,3);
  assert.equal(byId[4].coverage,100);
  assert.equal(byId[5].status,'unknown');
  assert.equal(byId[999].status,'unknown');
  assert.equal(byId[6].expected,0);
  assert.equal(byId[6].missing,0);
  assert.equal(byId[6].status,'pending');
  const [retained] = await statisticsOverview(gateway,'retained',now);
  assert(retained.series.find(row=>row.metadataId===2).expected > byId[2].expected);
  const days = await statisticDays(gateway,4,now);
  assert.equal(days.reduce((sum,row)=>sum+row.expected,0),3);
  assert.equal(days.reduce((sum,row)=>sum+row.observed,0),3);
  assert.equal(days.reduce((sum,row)=>sum+row.missing,0),0);
  assert.deepEqual(await statisticDays(gateway,12345,now),[]);
  assert.throws(()=>coverageBounds('invalid',now));
  await assert.rejects(statisticDays(gateway,1.5,now));
  for(let i=0;i<35;i++) await q(`CREATE TABLE storage_${i}(id INTEGER PRIMARY KEY,value VARCHAR(255))`);
  await q('CREATE INDEX storage_value_index ON storage_0(value)');
  const quoted = source.options.type === 'mysql' || source.options.type === 'mariadb' ? '`odd\'name`' : '"odd\'name"';
  await q(`CREATE TABLE ${quoted}(id INTEGER PRIMARY KEY)`);
  const storage = await tableStorage(gateway,source.options.type);
  assert.equal(storage.length,38,'every user table, beyond the chart limit');
  assert(storage.some(row=>row.name==="odd'name"));
  const stats = storage.find(row=>row.name==='statistics_short_term');
  if(stats.totalBytes !== null) {
    assert(stats.indexBytes >= 0);
    if(['sqlite','postgres'].includes(source.options.type)) assert(stats.indexBytes > 0);
    assert.equal(stats.totalBytes,stats.dataBytes+stats.indexBytes);
  }
  if(source.options.type==='sqlite') assert(storage.every(row=>row.estimatedRows===null));
  await q('DELETE FROM statistics_short_term');
  const [empty] = await statisticsOverview(gateway,'day',now);
  assert.equal(empty.totalRows,0);
  assert.equal(empty.oldestTs,null);
  assert.deepEqual(empty.series,[]);
  console.log(`PASS ${source.options.type}: all-table storage, index allocation, quoted names, exact coverage, new series, grace, gaps, stale, null/orphan metadata, daily UTC detail, empty`);
}
module.exports={check};
if(require.main===module) (async()=>{
  const fs=require('node:fs'), path=require('node:path'), os=require('node:os'), crypto=require('node:crypto');
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'dbstats-overview-fixture-'));
  const database=path.join(folder,'fixture.sqlite');
  const source=new DataSource({type:'sqlite',database});
  try {
    await source.initialize();
    try{await check(source);}finally{await source.destroy();}
    const hash=()=>crypto.createHash('sha256').update(fs.readFileSync(database)).digest('hex');
    const before=hash();
    const readOnly=new DataSource({type:'sqlite',database,flags:require('sqlite3').OPEN_READONLY});
    await readOnly.initialize();
    try {
      const gateway=new QueryGateway(readOnly);
      assert.equal((await tableStorage(gateway,'sqlite')).length,38);
      assert.equal((await statisticsOverview(gateway,'day',now))[0].totalRows,0);
      await assert.rejects(readOnly.query('INSERT INTO storage_0 VALUES (1,\'blocked\')'),/READONLY/);
      assert.equal(hash(),before);
      console.log('PASS SQLite read-only storage and coverage; file content unchanged');
    } finally {await readOnly.destroy();}
  } finally {fs.rmSync(folder,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
