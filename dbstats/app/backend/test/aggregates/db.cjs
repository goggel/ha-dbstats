const mysql = require('mysql2');
// Validate before creating a socket. This command has no production connection mode.
function options() {
  const host = process.env.AGG_FIXTURE_HOST || '127.0.0.1';
  const database = process.env.AGG_FIXTURE_DATABASE || 'dbstats_plan005_fixture';
  const port = Number(process.env.AGG_FIXTURE_PORT || 33505);
  if (host !== '127.0.0.1' || database !== 'dbstats_plan005_fixture' || port !== 33505) throw Error('Fixture allowlist rejected connection');
  return {host, port, database, user:'aggregate_fixture', password: 'disposable_fixture_only', charset:'utf8mb4', connectTimeout:5000, supportBigNumbers:true, bigNumberStrings:true};
}
function connect() {
  const db = mysql.createConnection(options());
  const query = (sql, values=[]) => new Promise((resolve,reject) => db.query({sql, values, timeout:15000}, (err, rows) => err ? reject(Object.assign(Error('Fixture query failed'), {code:err.code})) : resolve(rows)));
  return {db, query, close: () => new Promise(resolve => db.end(resolve))};
}
module.exports = {connect, options};
