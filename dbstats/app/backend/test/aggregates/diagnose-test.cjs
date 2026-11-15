const assert = require('node:assert/strict');
const fs = require('node:fs');
const {connect} = require('./db.cjs');
const {capture} = require('./diagnose.cjs');
async function main() {
  // Allowlist rejection is checked without making a connection.
  process.env.AGG_FIXTURE_HOST='example.invalid';
  assert.throws(connect,/allowlist/);
  delete process.env.AGG_FIXTURE_HOST;
  const observer=connect(), worker=connect();
  try {
    const id=Number((await worker.query('SELECT CONNECTION_ID() id'))[0].id);
    const pending=worker.query('SELECT SUM(SLEEP(0.2)) FROM states');
    let result;
    for(let attempt=0;attempt<10;attempt++) {
      result=await capture(observer.query,id);
      if(result.status==='captured') break;
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    await pending;
    assert.equal(result.status,'captured');
    assert.equal((await capture(observer.query,id)).status,'finished-or-unavailable');
    await worker.close();
    assert.equal((await capture(observer.query,id)).status,'finished-or-unavailable');
    const output=JSON.stringify(result,null,2);
    assert(!output.includes('password') && !output.includes('SHOW FULL PROCESSLIST') && !output.includes('SELECT SUM'));
    fs.writeFileSync(require('node:path').join(require('node:os').tmpdir(),`dbstats-diagnostic-${process.pid}.json`),output);
    console.log('diagnostic: running plan captured; finished/closed threads and allowlist passed');
  } finally {await observer.close(); if(!worker.db._closing) await worker.close();}
}
main().catch(err=>{console.error(err.code || err.message);process.exitCode=1;});
