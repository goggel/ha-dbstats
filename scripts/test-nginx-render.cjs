// Controlled fixture only: actual init script with disposable supervisor values.
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const script = `set -e
apk add --no-cache nginx
cp -r /fixture/etc/nginx /etc/
function bashio::addon.ingress_port(){ echo 6060; }
function bashio::addon.ingress_entry(){ echo /api/hassio_ingress/disposable_fixture; }
function bashio::addon.ip_address(){ echo 127.0.0.1; }
function bashio::dns.host(){ echo 127.0.0.1; }
source /fixture/etc/cont-init.d/nginx.sh
! grep -q '%%' /etc/nginx/nginx.conf
nginx -t`;
const result = spawnSync('podman',['run','--rm','--entrypoint','/bin/bash','-v',`${path.resolve('dbstats/rootfs')}:/fixture:ro`,'ghcr.io/hassio-addons/base-nodejs:0.2.5','-c',script],{stdio:'inherit',timeout:120000});
process.exitCode = result.status === 0 ? 0 : 1;
