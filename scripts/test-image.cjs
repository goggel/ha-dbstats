const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const sqlite = require('../dbstats/app/backend/node_modules/sqlite3');
const image = process.argv[2];
assert.ok(image);
function podman(args) {
  const r = spawnSync('podman', args, { encoding: 'utf8', timeout: 120000 });
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
 const name = `dbstats-plan003-smoke-${process.pid}`;
 try {
  await exec(writer,'PRAGMA journal_mode=WAL; CREATE TABLE fixture(value INTEGER); INSERT INTO fixture VALUES(42)');
  const snapshot = () => Object.fromEntries(fs.readdirSync(dir).map(n=>[n,[fs.statSync(path.join(dir,n)).mtimeMs,crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,n))).digest('hex')]]));
  const before = snapshot();
  const script = `const assert=require('assert/strict'),fs=require('fs'),s=require('sqlite3');assert.equal(process.version,'v24.22.3');assert.equal(s.VERSION,'3.52.0');assert.equal(require('sqlite3/package.json').version,'6.0.1');for(const n of ['fixture.db','fixture.db-wal','fixture.db-shm'])assert.throws(()=>fs.appendFileSync('/fixture/'+n,'x'),{code:'EROFS'});const db=new s.Database('/fixture/fixture.db',s.OPEN_READONLY);db.get('SELECT value FROM fixture',(e,row)=>{assert.ifError(e);assert.equal(row.value,42);db.run('INSERT INTO fixture VALUES(43)',e=>{assert.equal(e.code,'SQLITE_READONLY');db.close(e=>{assert.ifError(e);console.log(JSON.stringify({node:process.version,sqlite:s.VERSION,arch:process.arch}))})})});`;
  console.log(podman(['run','--rm','--pull=never','-v',`${dir}:/fixture:ro`,'--entrypoint','node',image,'-e',script]));
  assert.deepEqual(snapshot(),before);
  console.log(podman(['run','--rm','--pull=never','--entrypoint','sh',image,'-c','cat /etc/alpine-release; node --version; npm --version; openssl version; nginx -v; sqlite3 --version; apk info -v; test ! -e /usr/bin/g++; test ! -e /usr/bin/python3']));
  podman(['run','-d','--pull=never','--name',name,'-v',`${dir}:/fixture:ro`,'-e','DB_CONNECT_STRING=sqlite:///fixture/fixture.db',image]);
  let healthy = false;
  for(let i=0;i<30;i++) {
   try { podman(['exec',name,'node','-e',`(async()=>{for(const [url,status] of [['http://127.0.0.1:3000/addon-api',200],['http://127.0.0.1:6060/',200]]){const r=await fetch(url,{signal:AbortSignal.timeout(2000)});if(r.status!==status)process.exit(1)}})().catch(()=>process.exit(1))`]); healthy=true;break; } catch { await new Promise(r=>setTimeout(r,1000)); }
  }
  assert.ok(healthy,'entrypoint/backend/ingress health');
  assert.deepEqual(snapshot(),before);
  console.log(JSON.stringify({image, digest:info.Digest, repoDigests:info.RepoDigests, id:info.Id, architecture:info.Architecture, mountedReadonly:true, entrypoint:true, ingress:true}));
 } finally {
  spawnSync('podman',['rm','-f',name],{timeout:15000,stdio:'ignore'});
  await close(writer);fs.rmSync(dir,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e.message);process.exitCode=1});
