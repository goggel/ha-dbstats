const fs = require('node:fs');
const {connect} = require('./db.cjs');
async function capture(query, id) {
  if (!Number.isSafeInteger(id) || id < 1) throw Error('Invalid thread id');
  // Never save processlist SQL, host, user, or database names.
  const running = (await query('SHOW FULL PROCESSLIST')).some(r=>Number(r.Id)===id && r.Command==='Query');
  if (!running) return {status:'finished-or-unavailable'};
  try {
    const rows = await query(`SHOW EXPLAIN FORMAT=JSON FOR ${id}`);
    // Only the optimizer JSON, never SHOW EXPLAIN warnings (which can contain SQL).
    const plan = JSON.parse(rows[0]['SHOW EXPLAIN']);
    return {status:'captured',plan};
  } catch (err) {
    if (['ER_NO_SUCH_THREAD','ER_TARGET_NOT_EXPLAINABLE'].includes(err.code)) return {status:'finished-or-unavailable'};
    throw err;
  }
}
async function main() {
  const {query,close} = connect();
  try {
    const result = await capture(query,Number(process.argv[2]));
    result.indexes = await query('SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX, NON_UNIQUE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX');
    result.schema = await query('SELECT MAX(schema_version) schema_version FROM schema_changes');
    fs.writeFileSync(process.argv[3] || 'aggregate-diagnostic.json',JSON.stringify(result,null,2),{mode:0o600});
    console.log(result.status);
  } finally {await close();}
}
module.exports={capture};
if (require.main===module) main().catch(err=>{console.error(err.code || 'Diagnostic failed');process.exitCode=1;});
