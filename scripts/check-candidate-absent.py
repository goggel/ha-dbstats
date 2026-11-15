#!/usr/bin/env python3
"""Authenticated registry probe: only an explicit manifest 404 permits publishing."""
import base64
import json
import os
import sys
import urllib.error
import urllib.request

image = sys.argv[1]
assert image.startswith('ghcr.io/goggel/dbstats-test-')
package, version = image.removeprefix('ghcr.io/').split(':')
credentials = base64.b64encode((os.environ['GITHUB_ACTOR'] + ':' + os.environ['GHCR_TOKEN']).encode()).decode()
request = urllib.request.Request('https://ghcr.io/token?service=ghcr.io&scope=repository:' + package + ':pull', headers={'Authorization': 'Basic ' + credentials})
with urllib.request.urlopen(request, timeout=30) as response:
    token = json.load(response)['token']
request = urllib.request.Request('https://ghcr.io/v2/' + package + '/manifests/' + version, method='HEAD', headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.v2+json'})
try:
    urllib.request.urlopen(request, timeout=30).close()
except urllib.error.HTTPError as error:
    if error.code == 404:
        print('Candidate tag absent; publication permitted.')
        sys.exit(0)
    raise SystemExit('Registry probe failed; refusing publication (HTTP ' + str(error.code) + ').') from None
raise SystemExit('Candidate tag already exists. Commit a new candidate version; never overwrite.')
