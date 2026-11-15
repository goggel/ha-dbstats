const engine = process.env.CONTAINER_ENGINE || 'podman';
// Controlled fixture only: actual init script with disposable supervisor values.
const {spawnSync} = require('node:child_process');
const assert = require('node:assert/strict');
const image = process.argv[2];
assert.ok(image, 'usage: node scripts/test-nginx-render.cjs <final-image>');
const script = `set -e
function bashio::app.ingress_port(){ echo 6060; }
function bashio::app.ingress_entry(){ echo /api/hassio_ingress/disposable_fixture; }
function bashio::app.ip_address(){ echo 127.0.0.1; }
function bashio::dns.host(){ echo 127.0.0.1; }
source /etc/cont-init.d/nginx.sh
! grep -q '%%' /etc/nginx/nginx.conf
nginx -t`;
const result = spawnSync(engine,['run','--rm','--entrypoint','/bin/bash','--pull=never',image,'-c',script],{stdio:'inherit',timeout:120000});
process.exitCode = result.status === 0 ? 0 : 1;
