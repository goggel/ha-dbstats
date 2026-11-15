const engine = process.env.CONTAINER_ENGINE || 'podman';
// Run the approved transport assertions inside an actual final image.
// Certificate/container setup stays on the host; no runtime tools are installed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const image = process.argv[2];
assert.ok(image, 'usage: node scripts/test-image-transport.cjs <final-image>');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbstats-final-tls-'));
// Mount only public certificates and the disposable server key. CA signing keys
// remain in the private (0700) generation directory.
const certs = path.join(dir, 'certs');
fs.mkdirSync(certs, { mode: 0o755 });
const worker = `dbstats-final-tls-${process.pid}`;
const server = `${worker}-mariadb`;
const created = [];
function run(command, args, timeout = 60000) {
  const r = spawnSync(command, args, { encoding: 'utf8', timeout });
  assert.equal(r.status, 0, r.error?.message || (r.stdout + r.stderr));
  return r.stdout;
}
function start(name, args) {
  run(engine, ['run', '-d', '--pull=never', '--name', name, ...args]);
  created.push(name);
}
(async () => {
  try {
    for (const ca of ['ca', 'wrong']) run('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', `/CN=${ca}`, '-keyout', `${dir}/${ca}.key`, '-out', `${dir}/${ca}.crt`]);
    run('openssl', ['req', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=localhost', '-keyout', `${dir}/server.key`, '-out', `${dir}/server.csr`]);
    fs.writeFileSync(`${dir}/ext`, 'subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n');
    run('openssl', ['x509', '-req', '-days', '1', '-in', `${dir}/server.csr`, '-CA', `${dir}/ca.crt`, '-CAkey', `${dir}/ca.key`, '-CAcreateserial', '-extfile', `${dir}/ext`, '-out', `${dir}/server.crt`]);
    for (const file of ['ca.crt', 'wrong.crt', 'server.crt', 'server.key']) {
      fs.copyFileSync(`${dir}/${file}`, `${certs}/${file}`);
      fs.chmodSync(`${certs}/${file}`, 0o644);
    }
    start(worker, ['--network=none', '-v', `${certs}:/certs:ro`, '--entrypoint=node', image, '-e', 'setInterval(()=>{},1000)']);
    start(server, [`--network=container:${worker}`, '-v', `${certs}:/certs:ro`, '-e', 'MARIADB_RANDOM_ROOT_PASSWORD=1', '-e', 'MARIADB_DATABASE=dbstats_plan004_fixture', '-e', 'MARIADB_USER=dbstats_fixture', '-e', 'MARIADB_PASSWORD=disposable_fixture_only', 'docker.io/library/mariadb:11.8', '--ssl-ca=/certs/ca.crt', '--ssl-cert=/certs/server.crt', '--ssl-key=/certs/server.key', '--require-secure-transport=ON']);
    let ready = false;
    for (let i = 0; i < 45; i++) {
      ready = spawnSync(engine, ['exec', server, 'healthcheck.sh', '--connect'], { timeout: 3000, stdio: 'ignore' }).status === 0;
      if (ready) break;
      await new Promise(r => setTimeout(r, 1000));
    }
    if (!ready) {
      // Never inspect Config.Env or print the random root password from logs.
      for (const name of [worker, server]) {
        const state = spawnSync(engine, ['inspect', '--format', '{{json .State}}', name], { encoding: 'utf8', timeout: 5000 });
        const logs = spawnSync(engine, ['logs', '--tail', '60', name], { encoding: 'utf8', timeout: 5000 });
        const redact = text => (text || '').replace(/(GENERATED ROOT PASSWORD:)[^\r\n]*/gi, '$1 <REDACTED>').replaceAll('disposable_fixture_only', '<REDACTED>');
        console.error(`${name} state: ${redact(state.stdout || state.stderr).slice(-4000)}`);
        console.error(`${name} recent logs: ${redact(logs.stdout + logs.stderr).slice(-8000)}`);
      }
    }
    assert.ok(ready, 'TLS fixture readiness');
    // Preserve the approved effective-options helper and all actual TLS/socket
    // assertions. Only move setup outside the image and use its isolated port.
    const source = fs.readFileSync('dbstats/app/backend/test/transport/run.cjs', 'utf8');
    const header = source.slice(0, source.indexOf('const name =')).replace('../../dist/backend/src/mysql-transport', './dist/backend/src/mysql-transport');
    const helper = source.slice(source.indexOf('function effective'), source.indexOf('(async () => {')).replaceAll('127.0.0.1:33316', '127.0.0.1:3306');
    const begin = source.indexOf('    await connect(');
    const end = source.indexOf('  } finally {\n    if (created)');
    assert.ok(begin > 0 && end > begin, 'Approved fixture assertion boundaries');
    const script = `${header}\nconst dir=fs.mkdtempSync(path.join(os.tmpdir(),'final-transport-'));for(const n of ['ca.crt','wrong.crt'])fs.copyFileSync('/certs/'+n,dir+'/'+n);\n${helper}\n(async()=>{try{${source.slice(begin,end)}}finally{fs.rmSync(dir,{recursive:true,force:true})}})().catch(e=>{console.error(e.code||e.message);process.exitCode=1});`;
    console.log(run(engine, ['exec', worker, 'node', '-e', script]));
    console.log(JSON.stringify({ image, publishedPorts: false, actualFinalImageTransport: true }));
  } finally {
    for (const name of created.reverse()) spawnSync(engine, ['rm', '-f', '--volumes', name], { timeout: 15000, stdio: 'ignore' });
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
