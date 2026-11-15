require('ts-node').register({transpileOnly:true});
const assert=require('node:assert/strict');
const {DataSource}=require('typeorm');
const {QueryGateway}=require('../../src/query-gateway.ts');
const {normalize,queries}=require('./queries.cjs');
const entity = name => require(`../../src/entities/homeass/2024.1.5/${name}.ts`)[name];
async function withGateway(work) {
  const {options}=require('./db.cjs');
  const entities=['States','StatesMeta','StateAttributes','Statistics','StatisticsShortTerm','StatisticsMeta','Events','EventTypes','EventData'].map(entity);
  const ds=new DataSource({...options(),username:options().user,type:'mysql',entities,synchronize:false,migrationsRun:false,extra:{connectionLimit:2,connectTimeout:3000}});
  await ds.initialize();
  try { await work(ds,new QueryGateway(ds,{executionMs:1000,acquisitionMs:3000,queueMs:3000,concurrency:1,maxPending:8})); }
  finally {await ds.destroy();}
}
async function checkServices(query) {
 await withGateway(async(ds,gateway)=> {
  const repo=name=>ds.getRepository(entity(name));
  const {StateService}=require('../../src/state/state.service.ts');
  const {StatisticService}=require('../../src/statistic/statistic.service.ts');
  const {EventService}=require('../../src/event/event.service.ts');
  const state=new StateService(gateway,repo('States'),repo('StateAttributes'));
  const stats=new StatisticService(gateway,repo('StatisticsShortTerm'),repo('Statistics'));
  const events=new EventService(gateway,repo('Events'),repo('EventData'));
  for(const [name,run] of [['states',()=>state.countStateTypes()],['statistics',()=>stats.countStatsLong()],['statistics_short_term',()=>stats.countStatsShort()],['events',()=>events.countEventTypes()]]) {
    assert.deepEqual(normalize(await gateway.runOperation(run)),normalize(await query(queries(name).baseline)),name);
  }
  const attrs=(await query(queries('attributes').baseline)).filter(r=>Number(r.cnt)>0.01).map(r=>({type:r.type,cnt:Math.round(Number(r.cnt)*100)/100}));
  assert.deepEqual(normalize(await gateway.runOperation(()=>state.countAttributesSize())),normalize(attrs));
  // Every experiment executes through the same bounded driver/gateway path.
  for(const name of require('./queries.cjs').names) for(const sql of Object.values(queries(name)))
    assert.deepEqual(normalize(await gateway.query(sql)),normalize(await query(queries(name).baseline)));
  const errors=[];
  const create=ds.createQueryRunner.bind(ds);
  ds.createQueryRunner=(...args)=>{const runner=create(...args),run=runner.query.bind(runner);runner.query=async(...a)=>{try{return await run(...a);}catch(e){errors.push(e.driverError);throw e;}};return runner;};
  const slow='WITH RECURSIVE n AS (SELECT 1 x UNION ALL SELECT x+1 FROM n WHERE x<1000) SELECT SUM(a.x*b.x*c.x*d.x) FROM n a CROSS JOIN n b CROSS JOIN n c CROSS JOIN n d';
  await assert.rejects(gateway.query(slow),e=>e.getResponse?.()?.code==='QUERY_TIMEOUT');
  assert(errors.some(e=>e?.errno===1969),'Native MariaDB timeout required');
  assert.equal(Number((await gateway.query('SELECT 42 answer'))[0].answer),42);
 });
}
module.exports={checkServices};
