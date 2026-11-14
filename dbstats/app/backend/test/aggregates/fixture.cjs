// Own named disposable fixture only; never inspect/remove another task's container.
const {spawnSync}=require('node:child_process');
const assert=require('node:assert/strict');
require('./db.cjs').options(); // validate before any Docker/connection action
const name='dbstats-plan005-aggregate-owned';
// This runner owns its credential-free disposable instance.
delete process.env.AGG_FIXTURE_PASSWORD;
process.env.DB_CONNECT_STRING='mysql://aggregate_fixture:disposable_fixture_only@127.0.0.1:33505/dbstats_plan005_fixture';
function docker(args,ok=true){const r=spawnSync('docker',args,{timeout:120000,encoding:'utf8'});if(ok)assert.equal(r.status,0,`Docker fixture operation failed: ${args[0]}`);return r;}
function run(file,args=[]){const r=spawnSync(process.execPath,[file,...args],{stdio:'inherit',timeout:180000});assert.equal(r.status,0,`${file} failed or exceeded deadline`);}
let owned=false;
try {
 assert.notEqual(docker(['inspect',name],false).status,0,'Own fixture name already exists; refusing reuse or deletion');
 docker(['run','--name',name,'--detach','--publish','127.0.0.1:33505:3306','--env','MARIADB_ALLOW_EMPTY_ROOT_PASSWORD=1','--env','MARIADB_USER=aggregate_fixture','--env','MARIADB_PASSWORD=disposable_fixture_only','--env','MARIADB_DATABASE=dbstats_plan005_fixture','mariadb:11.8']);owned=true;
 let ready=false;
 for(let i=0;i<40;i++){if(docker(['exec',name,'healthcheck.sh','--connect','--innodb_initialized'],false).status===0){ready=true;break;}spawnSync(process.execPath,['-e','setTimeout(()=>{},500)'],{timeout:1000});}
 assert(ready,'MariaDB fixture startup deadline');
 run('test/aggregates/run.cjs',[process.argv[2]||'test',...process.argv.slice(3)]);
 if(process.argv[2]!=='bench')run('test/aggregates/diagnose-test.cjs');
} finally {if(owned)docker(['rm','--force',name]);}
