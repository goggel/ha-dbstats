// Standalone, named disposable transport fixture. No operator URLs or mounts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const mysql = require('mysql2');
const { DataSource } = require('typeorm');
const { mysqlTransport } = require('../../dist/backend/src/mysql-transport');
const name = 'dbstats-plan004-transport-fixture';
const dir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'dbstats-plan004-transport-'),
);
let created = false;
function run(command, args) {
  const r = spawnSync(command, args, { encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, r.error?.message || r.stderr);
  return r.stdout;
}
const pod = (...args) => run('podman', args);
function effective(uri) {
  const options = mysqlTransport(uri);
  const ds = new DataSource(options);
  return ds.driver.createConnectionOptions(
    ds.driver.options,
    ds.driver.options,
  );
}
async function connect(query) {
  const c = await mysql
    .createConnection({
      ...effective(
        `mysql://dbstats_fixture:disposable_fixture_only@127.0.0.1:33316/dbstats_plan004_fixture?${query}`,
      ),
      connectTimeout: 3000,
    })
    .promise();
  try {
    const [rows] = await c.query({
      sql: "SHOW STATUS LIKE 'Ssl_cipher'",
      timeout: 3000,
    });
    assert.ok(rows[0].Value);
  } finally {
    c.destroy();
  }
}
(async () => {
  try {
    for (const ca of ['ca', 'wrong'])
      run('openssl', [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '1',
        '-subj',
        `/CN=${ca}`,
        '-keyout',
        `${dir}/${ca}.key`,
        '-out',
        `${dir}/${ca}.crt`,
      ]);
    run('openssl', [
      'req',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-subj',
      '/CN=localhost',
      '-keyout',
      `${dir}/server.key`,
      '-out',
      `${dir}/server.csr`,
    ]);
    fs.writeFileSync(
      `${dir}/ext`,
      'subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n',
    );
    run('openssl', [
      'x509',
      '-req',
      '-days',
      '1',
      '-in',
      `${dir}/server.csr`,
      '-CA',
      `${dir}/ca.crt`,
      '-CAkey',
      `${dir}/ca.key`,
      '-CAcreateserial',
      '-extfile',
      `${dir}/ext`,
      '-out',
      `${dir}/server.crt`,
    ]);
    pod(
      'create',
      '--name',
      name,
      '-p',
      '127.0.0.1:33316:3306',
      '-e',
      'MARIADB_RANDOM_ROOT_PASSWORD=1',
      '-e',
      'MARIADB_DATABASE=dbstats_plan004_fixture',
      '-e',
      'MARIADB_USER=dbstats_fixture',
      '-e',
      'MARIADB_PASSWORD=disposable_fixture_only',
      'docker.io/library/mariadb:11.8',
      '--ssl-ca=/tmp/ca.crt',
      '--ssl-cert=/tmp/server.crt',
      '--ssl-key=/tmp/server.key',
      '--require-secure-transport=ON',
    );
    created = true;
    for (const file of ['ca.crt', 'server.crt', 'server.key']) {
      fs.chmodSync(`${dir}/${file}`, 0o644);
      pod('cp', `${dir}/${file}`, `${name}:/tmp/${file}`);
    }
    pod('start', name);
    for (let i = 0; i < 45; i++) {
      if (
        spawnSync('podman', ['exec', name, 'healthcheck.sh', '--connect'], {
          timeout: 3000,
          stdio: 'ignore',
        }).status === 0
      )
        break;
      assert.ok(i < 44, 'fixture readiness timeout');
      await new Promise((r) => setTimeout(r, 1000));
    }
    await connect(
      `ssl_mode=REQUIRED&ssl_ca=${encodeURIComponent(`${dir}/ca.crt`)}`,
    );
    await assert.rejects(
      connect(`ssl=true&ssl_ca=${encodeURIComponent(`${dir}/wrong.crt`)}`),
      (e) => {
        console.log('TLS rejection:', e.code);
        return e.code === 'HANDSHAKE_SSL_ERROR';
      },
    );
    await assert.rejects(connect('ssl=true'), (e) => {
      console.log('TLS rejection:', e.code);
      return e.code === 'HANDSHAKE_SSL_ERROR';
    });
    await assert.rejects(connect('charset=utf8mb4'), (e) => {
      console.log('Plaintext rejection:', e.code);
      return [
        'ER_ACCESS_DENIED_ERROR',
        'ER_SECURE_TRANSPORT_REQUIRED',
      ].includes(e.code);
    }); // server requires TLS
    console.log(
      'PASS actual TLS: trusted CA, wrong CA, untrusted CA, required transport',
    );
    // Socket protocol fixture is local and disposable; invalid TCP target proves selection.
    const socket = `${dir}/mysql.sock`;
    const server = mysql.createServer();
    const peers = new Set();
    server.on('connection', (c) => {
      peers.add(c);
      c.on('error', () => {});
      c.serverHandshake({
        protocolVersion: 10,
        serverVersion: '8.0.0-transport-fixture',
        connectionId: 1,
        statusFlags: 2,
        characterSet: 45,
        capabilityFlags: 0x00088209,
      });
      c.on('query', () =>
        c.writeTextResult(
          [{ fixture: 1 }],
          [{ name: 'fixture', columnType: 3 }],
        ),
      );
    });
    await new Promise((r) => server.listen(socket, r));
    try {
      const settings = effective(
        `mysql://u:p@unreachable.invalid:1/dbstats_plan004_fixture?unix_socket=${encodeURIComponent(socket)}&charset=utf8mb4`,
      );
      assert.equal(settings.socketPath, socket);
      const c = await mysql
        .createConnection({ ...settings, connectTimeout: 3000 })
        .promise();
      try {
        await c.ping();
        assert.equal(peers.size, 1);
      } finally {
        c.destroy();
      }
      console.log('PASS actual Unix socket selection');
      await assert.rejects(
        require('mysql2/promise').createConnection({
          ...effective(
            `mysql://u:p@unreachable.invalid/dbstats_plan004_fixture?unix_socket=${encodeURIComponent(socket)}`,
          ),
          ssl: { rejectUnauthorized: true, verifyIdentity: true },
          connectTimeout: 3000,
        }),
        (e) => e.code === 'HANDSHAKE_NO_SSL_SUPPORT',
      );
      console.log('PASS required TLS rejects a server without TLS support');
    } finally {
      for (const c of peers) c.stream.destroy();
      await new Promise((r) => server.close(r));
    }
  } finally {
    if (created) pod('rm', '-f', '--volumes', name);
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e.code || e.message);
  process.exitCode = 1;
});
