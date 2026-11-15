// Named, local, disposable fixtures. No host directories or persistent volumes.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
function run(args) {
 const r=spawnSync('podman',args,{encoding:'utf8',timeout:180000});
 assert.equal(r.status,0,r.error?.message || r.stderr);return r.stdout;
}
(async()=>{
 const native=spawnSync(process.execPath,['test/sqlite-interrupt.cjs'],{cwd:path.resolve('dbstats/app/backend'),stdio:'inherit',timeout:10000});assert.equal(native.status,0);
 const operation=spawnSync(process.execPath,['test/operation-http.cjs'],{cwd:path.resolve('dbstats/app/backend'),stdio:'inherit',timeout:10000});assert.equal(operation.status,0);
 const names=['dbstats-plan003-mariadb-fixture','dbstats-plan003-postgres-fixture','dbstats-plan004-mysql-fixture'];
 const created=[];
 try {
  run(['run','-d','--name',names[0],'-p','127.0.0.1:33306:3306','-e','MARIADB_RANDOM_ROOT_PASSWORD=1','-e','MARIADB_DATABASE=dbstats_plan003_fixture','-e','MARIADB_USER=dbstats_fixture','-e','MARIADB_PASSWORD=disposable_fixture_only','docker.io/library/mariadb:11.8']);created.push(names[0]);
  run(['run','-d','--name',names[1],'-p','127.0.0.1:35432:5432','-e','POSTGRES_DB=dbstats_plan003_fixture','-e','POSTGRES_USER=dbstats_fixture','-e','POSTGRES_PASSWORD=disposable_fixture_only','docker.io/library/postgres:17']);created.push(names[1]);
  run(['run','-d','--name',names[2],'-p','127.0.0.1:33307:3306','-e','MYSQL_RANDOM_ROOT_PASSWORD=1','-e','MYSQL_DATABASE=dbstats_plan003_fixture','-e','MYSQL_USER=dbstats_fixture','-e','MYSQL_PASSWORD=disposable_fixture_only','docker.io/library/mysql:8.4']);created.push(names[2]);
  for(let i=0;i<60;i++) {
   const ready=spawnSync('podman',['exec',names[0],'healthcheck.sh','--connect'],{timeout:5000,stdio:'ignore'}).status===0 && spawnSync('podman',['exec',names[1],'pg_isready','-U','dbstats_fixture'],{timeout:5000,stdio:'ignore'}).status===0;
   const mysqlReady=spawnSync('podman',['exec',names[2],'mysqladmin','ping','-h','127.0.0.1','-udbstats_fixture','-pdisposable_fixture_only'],{timeout:5000,stdio:'ignore'}).status===0;
   if(ready && mysqlReady)break;if(i===59)throw Error('Disposable database readiness timed out');await new Promise(r=>setTimeout(r,1000));
  }
  const r=spawnSync(process.execPath,['test/integration.cjs'],{cwd:path.resolve('dbstats/app/backend'),env:{...process.env,FIXTURE_PHASE:'all',FIXTURE_MYSQL_URL:'mysql://dbstats_fixture:disposable_fixture_only@127.0.0.1:33306/dbstats_plan003_fixture',FIXTURE_POSTGRES_URL:'postgres://dbstats_fixture:disposable_fixture_only@127.0.0.1:35432/dbstats_plan003_fixture'},stdio:'inherit',timeout:60000});assert.equal(r.status,0);
  const deadline=spawnSync(process.execPath,['test/query-deadlines.cjs'],{cwd:path.resolve('dbstats/app/backend'),env:{...process.env,FIXTURE_MYSQL_URL:'mysql://dbstats_fixture:disposable_fixture_only@127.0.0.1:33306/dbstats_plan003_fixture',FIXTURE_ORACLE_MYSQL_URL:'mysql://dbstats_fixture:disposable_fixture_only@127.0.0.1:33307/dbstats_plan003_fixture',FIXTURE_POSTGRES_URL:'postgres://dbstats_fixture:disposable_fixture_only@127.0.0.1:35432/dbstats_plan003_fixture'},stdio:'inherit',timeout:60000});assert.equal(deadline.status,0);
 }finally{for(const n of created)spawnSync('podman',['rm','-f','--volumes',n],{timeout:60000,stdio:'ignore'});}
})().catch(e=>{console.error(e.message);process.exitCode=1});
