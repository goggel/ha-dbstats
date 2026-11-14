const assert = require('node:assert/strict');
const fs = require('node:fs');
const {connect} = require('./db.cjs');
const {queries, normalize, names} = require('./queries.cjs');
const {indexes, create, seed} = require('./schema.cjs');
async function main() {
  const mode = process.argv[2] || 'test';
  const args = process.argv.slice(3);
  const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name)+1] : fallback;
  const baseline = option('--baseline','baseline'), candidate = option('--candidate','candidate');
  assert.equal(baseline,'baseline'); assert.equal(candidate,'candidate');
  const stateSource = fs.readFileSync('src/entities/homeass/2024.1.5/States.ts','utf8');
  assert.match(stateSource, /'ix_states_metadata_id_last_updated_ts',\s*\['metadataId', 'lastUpdatedTs'\]/);
  const config = fs.readFileSync('src/database.module.ts','utf8');
  assert.match(config,/synchronize: false/);
  assert.doesNotMatch(config,/migrationsRun:\s*true/);
  assert.deepEqual(normalize([{type:null,cnt:2}]), normalize([{type:null,cnt:'2'}]));
  const {query, close} = connect();
  try {
    const version = (await query('SELECT VERSION() version'))[0].version;
    assert.match(version,/^11\.8\./);
    await create(query);
    for (const name of names) assert.deepEqual(await query(queries(name).baseline),[]);
    await seed(query);
    await require('./services.cjs').checkServices(query);
    const targetRows=Number(option('--rows','11'));
    assert(Number.isSafeInteger(targetRows) && targetRows>=11 && targetRows<=1000000);
    let rows=11;
    while(rows<targetRows) {
      const batch=Math.min(rows,targetRows-rows);
      await query(`INSERT INTO states(metadata_id,attributes_id,last_updated_ts) SELECT metadata_id,attributes_id,last_updated_ts+? FROM states LIMIT ${batch}`,[rows]);
      rows+=batch;
    }
    const actual = await query('SELECT TABLE_NAME t, INDEX_NAME n, COLUMN_NAME c, NON_UNIQUE u FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX');
    for (const [table, definitions] of Object.entries(indexes)) for (const [name, columns] of Object.entries(definitions)) {
      const rows = actual.filter(r=>r.t===table && r.n===name);
      assert.deepEqual(rows.map(r=>r.c),columns);
      if (['statistics','statistics_short_term','states_meta','statistics_meta'].includes(table)) assert(rows.every(r=>Number(r.u)===0));
    }
    const results = [];
    for (const name of names) {
      const sql = queries(name);
      const original = await query(sql.baseline), proposed = await query(sql.candidate);
      assert.deepEqual(normalize(proposed),normalize(original),name);
      if (name !== 'attributes' && !(name === 'states' && targetRows>11)) assert.deepEqual(normalize(original),normalize([{type:'sensor.a',cnt:5},{type:'sensor.b',cnt:2},{type:null,cnt:2}]));
      else if (name === 'attributes') {
        const bytes = Object.fromEntries(original.map(r=>[String(r.type),Number(r.cnt)*1024*1024]));
        for (const [label, value] of Object.entries({'sensor.a':16000,'sensor.b':32000,'null':16000})) assert(Math.abs(bytes[label]-value)<0.01);
      }
      const record = {name, results:normalize(original), plans:{}, timingsMs:{}};
      if (mode === 'bench') {
        for (const variant of ['baseline','candidate']) {
          record.plans[variant] = JSON.parse((await query(`EXPLAIN FORMAT=JSON ${sql[variant]}`))[0].EXPLAIN);
          record.timingsMs[variant]=[];
          for (let i=0;i<5;i++) {
            const start = process.hrtime.bigint();
            assert.deepEqual(normalize(await query(sql[variant])),normalize(original));
            record.timingsMs[variant].push(Number(process.hrtime.bigint()-start)/1e6);
          }
        }
        const median = values => [...values].sort((a,b)=>a-b)[2];
        record.medianRatio=median(record.timingsMs.candidate)/median(record.timingsMs.baseline);
        record.regression=record.medianRatio>1.05;
      }
      results.push(record);
    }
    const artifact = {version, schema:53, fixture:'small semantic fixture; NOT representative of production', cache:'warm; no cache flush; baseline then candidate; five repetitions', indexes:actual, distributions:await query('SELECT metadata_id, COUNT(*) cnt FROM states GROUP BY metadata_id'), results, adoption:'No production rewrite adopted; representative evidence and gateway gate deferred'};
    if (mode === 'bench') {
      const output = option('--output','aggregate-benchmark.json');
      fs.writeFileSync(output,JSON.stringify(artifact,null,2));
      console.log(`Artifact: ${output}`);
      if (results.some(r=>r.regression)) process.exitCode=1;
    }
    console.log(`${mode}: original baselines, candidate equivalence, HA index order and configuration checks passed`);
  } finally {await close();}
}
main().catch(err=>{console.error(err.code === 'ERR_ASSERTION' ? err.stack : (err.code || err.message));process.exitCode=1;});
