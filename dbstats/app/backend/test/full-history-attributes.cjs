// Real service and SQL over disposable fixtures; never connect to a recorder.
const assert = require('node:assert/strict');
const {DataSource} = require('typeorm');
const {QueryGateway} = require('../dist/backend/src/query-gateway');
require.cache[require.resolve('../dist/backend/src/config')] = {exports:{default:()=>({maxRowsInChart:20})}};
const {StateService} = require('../dist/backend/src/state/state.service');

async function check(source) {
  const gateway = new QueryGateway(source, {executionMs:8000,acquisitionMs:3000,queueMs:3000,concurrency:1,maxPending:8});
  const service = new StateService(gateway, null, null);
  const q = (sql, params) => source.query(sql, params);
  await q('CREATE TABLE states (state_id INTEGER PRIMARY KEY, metadata_id INTEGER, attributes_id INTEGER)');
  await q('CREATE TABLE states_meta (metadata_id INTEGER PRIMARY KEY, entity_id VARCHAR(100))');
  await q('CREATE TABLE state_attributes (attributes_id INTEGER PRIMARY KEY, shared_attrs TEXT)');
  await q('CREATE INDEX ix_states_attributes_id ON states(attributes_id)');
  await q("INSERT INTO states_meta VALUES (1,'sensor.old'),(2,'sensor.recent'),(3,'sensor.shared')");
  const bind = source.options.type === 'postgres' ? '$1' : '?';
  await q(`INSERT INTO state_attributes VALUES (1,${bind})`, ['é'.repeat(12000)]);
  await q("INSERT INTO state_attributes VALUES (2,'tiny'),(3,NULL),(4,'unreferenced')");
  await q('INSERT INTO states VALUES (1,1,1),(2,1,1),(3,3,1),(4,99,1),(5,1,99),(6,1,3)');
  for (let start=100; start<21100; start+=1000) {
    await q('INSERT INTO states VALUES '+Array.from({length:1000},(_,i)=>`(${start+i},2,2)`).join(','));
  }
  const rows = await service.countAttributesSize();
  const byType = Object.fromEntries(rows.map(row => [row.type, Number(row.cnt)*1024*1024]));
  assert.deepEqual(Object.keys(byType).sort(), ['sensor.old','sensor.recent','sensor.shared']);
  for (const label of ['sensor.old','sensor.shared']) assert(Math.abs(byType[label]-24000)<0.001, `${label}: full old history, byte size and deduplication`);
  assert(Math.abs(byType['sensor.recent']-4)<0.001, 'small payloads retain precision');
  await q('DELETE FROM states');
  assert.deepEqual(await service.countAttributesSize(), []);
  console.log(`PASS ${source.options.type}: full history outside recent 20,000, Unicode bytes, shared/deduplicated/tiny/null/orphan payloads, empty`);
}

async function main() {
  const source = new DataSource({type:'sqlite',database:':memory:'});
  await source.initialize();
  try { await check(source); } finally { await source.destroy(); }
}
module.exports = {check};
if (require.main === module) main().catch(error=>{console.error(error);process.exitCode=1;});
