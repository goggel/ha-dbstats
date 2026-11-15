const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const sqlite = require('../dbstats/app/backend/node_modules/sqlite3');
const image = process.argv[2];
assert.ok(image);
function podman(args, timeout = 120000) {
  const r = spawnSync('podman', args, { encoding: 'utf8', timeout });
  assert.equal(r.status, 0, r.error?.message || r.stderr);
  return r.stdout;
}
const exec = (db, sql) => new Promise((r,j) => db.exec(sql,e=>e?j(e):r()));
const close = db => new Promise((r,j) => db.close(e=>e?j(e):r()));
(async () => {
 const info = JSON.parse(podman(['image','inspect',image]))[0];
 assert.ok(['amd64','arm64'].includes(info.Architecture));
 assert.ok(info.Config.Entrypoint.includes('/init'));
 const dir = fs.mkdtempSync(path.join(os.tmpdir(),'plan003-image-'));
 const writer = new sqlite.Database(path.join(dir,'fixture.db'));
 const name = `dbstats-final-smoke-${process.pid}`;
 const supervisor = `${name}-supervisor`;
 const network = `${name}-network`;
 try {
  await exec(writer,'PRAGMA journal_mode=WAL; CREATE TABLE fixture(value INTEGER); INSERT INTO fixture VALUES(42)');
  const snapshot = () => Object.fromEntries(fs.readdirSync(dir).map(n=>[n,[fs.statSync(path.join(dir,n)).mtimeMs,crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,n))).digest('hex')]]));
  const before = snapshot();
  const modulePath = process.env.FIXTURE_IMAGE_SQLITE_MODULE || 'sqlite3';
  const script = `const assert=require('assert/strict'),fs=require('fs'),s=require(${JSON.stringify(modulePath)});assert.equal(process.version,'v24.22.3');assert.equal(s.VERSION,'3.52.0');assert.equal(require(${JSON.stringify(modulePath + '/package.json')}).version,'6.0.1');for(const n of ['fixture.db','fixture.db-wal','fixture.db-shm'])assert.throws(()=>fs.appendFileSync('/fixture/'+n,'x'),{code:'EROFS'});const db=new s.Database('/fixture/fixture.db',s.OPEN_READONLY);db.get('SELECT value,sqlite_version() AS runtimeSQLite FROM fixture',(e,row)=>{assert.ifError(e);assert.equal(row.value,42);assert.equal(row.runtimeSQLite,'3.53.4');db.run('INSERT INTO fixture VALUES(43)',e=>{assert.equal(e.code,'SQLITE_READONLY');db.close(e=>{assert.ifError(e);console.log(JSON.stringify({node:process.version,sqliteHeader:s.VERSION,sqliteRuntime:row.runtimeSQLite,arch:process.arch}))})})});`;
  console.log(podman(['run','--rm','--pull=never','-v',`${dir}:/fixture:ro`,'--entrypoint','node',image,'-e',script]));
  assert.deepEqual(snapshot(),before);
  if (process.env.FIXTURE_IMAGE_NATIVE_ONLY === '1') { console.log(JSON.stringify({id:info.Id,architecture:info.Architecture,mountedReadonly:true,subset:'native-only; final image/entrypoint/ingress NOT accepted'})); return; }
  console.log(podman(['run','--rm','--pull=never','--entrypoint','sh',image,'-c','set -e; cat /etc/alpine-release; node --version; npm --version; if command -v openssl >/dev/null; then openssl version; else echo OpenSSL-CLI-absent; node -p process.versions.openssl; fi; nginx -v 2>&1; sqlite3 --version; apk info -v; test -f /usr/src/app/dist/backend/src/main.js; test -f /var/www/html/index.html; test ! -e /usr/bin/g++; test ! -e /usr/bin/python3']));
  const inventoryScript = `const fs=require('fs'),path=require('path');const names=new Set(['express','body-parser','js-yaml','tar','tar-fs','sqlite3','typeorm','prebuild-install','node-gyp']);const found=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(!e.isDirectory())continue;const p=path.join(dir,e.name);if(e.name.startsWith('@')){walk(p);continue}const f=path.join(p,'package.json');if(fs.existsSync(f)){const v=JSON.parse(fs.readFileSync(f));if(names.has(v.name))found.push({path:p,name:v.name,version:v.version})}if(fs.existsSync(path.join(p,'node_modules')))walk(path.join(p,'node_modules'))}}walk('/usr/src/app/node_modules');console.log(JSON.stringify({node:process.version,arch:process.arch,nativeSQLite:require('sqlite3').VERSION,packages:found}))`;
  console.log(podman(['run','--rm','--pull=never','--entrypoint','node',image,'-e',inventoryScript]));
  const nativeInterrupt = fs.readFileSync(path.join(__dirname,'../dbstats/app/backend/test/sqlite-interrupt.cjs'),'utf8').replaceAll('../dist/backend/src/', './dist/backend/src/');
  console.log(podman(['run','--rm','--pull=never','--entrypoint','node',image,'-e',nativeInterrupt],15000));
  // Disposable Supervisor metadata server, also the sole ingress-authorized client.
  podman(['network','create','--subnet','172.30.32.0/24',network]);
  const fakeApi = `require('http').createServer((q,r)=>{r.setHeader('Content-Type','application/json');r.end(JSON.stringify({result:'ok',data:{slug:'disposable',name:'Image acceptance fixture',version:'fixture',arch:process.arch,ingress:true,ingress_port:6060,ingress_entry:'/api/hassio_ingress/disposable_fixture',ip_address:'172.30.32.3',host:'172.30.32.2',hostname:'fixture',options:{},boot:'auto',startup:'application',services:[]}}))}).listen(80,'0.0.0.0')`;
  podman(['run','-d','--pull=never','--name',supervisor,'--network',network,'--ip','172.30.32.2','--network-alias','supervisor','--entrypoint','node',image,'-e',fakeApi]);
  const startupStarted = Date.now();
  podman(['run','-d','--pull=never','--name',name,'--network',network,'--ip','172.30.32.3','-e','SUPERVISOR_TOKEN=disposable-image-fixture', '-v',`${dir}:/fixture:ro`,'-e','DB_CONNECT_STRING=sqlite:///fixture/fixture.db',image]);
  let healthy = false;
  const readyDeadline = Date.now() + 90000;
  for(let i=0;i<30 && Date.now()<readyDeadline;i++) {
   try { podman(['exec',name,'node','-e',`(async()=>{for(const [url,status] of [['http://127.0.0.1:3000/addon-api',200],['http://172.30.32.3:6060/',403]]){const r=await fetch(url,{signal:AbortSignal.timeout(2000)});if(r.status!==status)process.exit(1)}})().catch(()=>process.exit(1))`], 5000); healthy=true;break; } catch { await new Promise(r=>setTimeout(r,1000)); }
  }
  if (!healthy) console.error(podman(['logs',name]));
  assert.ok(healthy,'entrypoint/backend/ingress health');
  console.log(podman(['exec',supervisor,'node','-e',`(async()=>{const assert=require('assert/strict');const base='http://172.30.32.3:6060';for(const url of ['/','/addon-api/','/manifest.json']){const r=await fetch(base+url,{signal:AbortSignal.timeout(3000)});assert.equal(r.status,200,url);if(url==='/'){const html=await r.text();assert.ok(html.includes('api/hassio_ingress/disposable_fixture/static/js'));const asset=html.split('src="').slice(1).map(s=>s.split('"')[0]).find(s=>s.endsWith('.js'));assert.ok(asset);const target=asset.replace('/api/hassio_ingress/disposable_fixture','').replace('api/hassio_ingress/disposable_fixture','');assert.equal((await fetch(base+target)).status,200)}}console.log('PASS final image ingress allow/deny, HTML prefix and static JS')})().catch(e=>{console.error(e);process.exit(1)})`]));
  const startupMs = Date.now()-startupStarted;
  const started = Date.now();
  podman(['stop','--time','20',name], 25000);
  assert.ok(Date.now()-started < 25000,'bounded stop');
  const stopped=JSON.parse(podman(['inspect',name]))[0];
  assert.equal(stopped.State.ExitCode,0,'clean s6 shutdown');
  assert.deepEqual(snapshot(),before);
  console.log(JSON.stringify({image, digest:info.Digest, repoDigests:info.RepoDigests, id:info.Id, architecture:info.Architecture, mountedReadonly:true, files:before, startupMs, stopMs:Date.now()-started, exitCode:stopped.State.ExitCode, entrypoint:true, ingress:true}));
 } finally {
  spawnSync('podman',['rm','-f',name],{timeout:15000,stdio:'ignore'});
  spawnSync('podman',['rm','-f',supervisor],{timeout:15000,stdio:'ignore'});
  spawnSync('podman',['network','rm',network],{timeout:15000,stdio:'ignore'});
  await close(writer);fs.rmSync(dir,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e.message);process.exitCode=1});
