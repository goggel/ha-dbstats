const assert = require('node:assert/strict');
// Exact disposable endpoints only. Validate every supplied URL before any connection.
function validateFixtureUrls(env) {
  for (const [key, protocol, port] of [['FIXTURE_ORACLE_MYSQL_URL', 'mysql:', '33307'], ['FIXTURE_MYSQL_URL', 'mysql:', '33306'], ['FIXTURE_POSTGRES_URL', 'postgres:', '35432']]) {
    if (!env[key]) continue;
    let u;
    try { u = new URL(env[key]); } catch { throw Error(`Invalid disposable fixture target: ${key}`); }
    assert.ok(u.protocol === protocol && u.hostname === '127.0.0.1' && u.port === port && u.pathname === '/dbstats_plan003_fixture' && u.username === 'dbstats_fixture' && u.password === 'disposable_fixture_only' && !u.search && !u.hash, `Rejected non-disposable fixture target: ${key}`);
  }
}
module.exports = { validateFixtureUrls };
if (require.main === module) {
  for (const target of ['mysql://user:password@production/database', 'mysql://dbstats_fixture:disposable_fixture_only@127.0.0.1:33306/production', 'mysql://dbstats_fixture:disposable_fixture_only@127.0.0.1:33306/dbstats_plan003_fixture?host=production', 'postgres://user:password@production/database']) {
    assert.throws(() => validateFixtureUrls({ [target.startsWith('mysql') ? 'FIXTURE_MYSQL_URL' : 'FIXTURE_POSTGRES_URL']: target }));
  }
  console.log('PASS synthetic production/arbitrary fixture URL rejection');
}
