// Execute unchanged service methods through a minimal repository adapter. This
// checks their selected SQL clauses; full TypeORM/driver wiring belongs to 003.
require('ts-node').register({transpileOnly:true});
const path=require('node:path');
const assert=require('node:assert/strict');
const {normalize,queries}=require('./queries.cjs');
const config=path.resolve('src/config.ts');
require.cache[config]={id:config,filename:config,loaded:true,exports:{default:()=>({maxRowsInChart:30})}};
const {getMetadataArgsStorage}=require('typeorm');
const {StateService}=require('../../src/state/state.service.ts');
const {StatisticService}=require('../../src/statistic/statistic.service.ts');
const {EventService}=require('../../src/event/event.service.ts');
function repo(table,query) {
  return {manager:{query},createQueryBuilder(alias){
    let selected,joined,group,order,limit;
    const builder={
      select(s){selected=s;return this;},
      innerJoin(entity,a,on){const t=getMetadataArgsStorage().tables.find(t=>t.target===entity).name;joined=`JOIN ${t} ${a} ON ${on}`;return this;},
      groupBy(g){group=g;return this;},orderBy(o,d){order=`${o} ${d}`;return this;},limit(l){assert.equal(l,30);limit=l;return this;},
      execute(){return query(`SELECT ${selected} FROM ${table} ${alias} ${joined} GROUP BY ${group} ORDER BY ${order} LIMIT ${limit}`);},
    };return builder;
  }};
}
async function checkServices(query) {
  const state=new StateService(repo('states',query),repo('state_attributes',query));
  const stats=new StatisticService(repo('statistics_short_term',query),repo('statistics',query));
  const events=new EventService(repo('events',query),repo('event_data',query));
  for(const [name,run] of [['states',()=>state.countStateTypes()],['statistics',()=>stats.countStatsLong()],['statistics_short_term',()=>stats.countStatsShort()],['events',()=>events.countEventTypes()]]) {
    assert.deepEqual(normalize(await run()),normalize(await query(queries(name).baseline)),name);
  }
  const attrs=(await query(queries('attributes').baseline)).filter(r=>Number(r.cnt)>0.01).map(r=>({type:r.type,cnt:Math.round(Number(r.cnt)*100)/100}));
  assert.deepEqual(normalize(await state.countAttributesSize()),normalize(attrs));
}
module.exports={checkServices};
