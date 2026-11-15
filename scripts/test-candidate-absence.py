"""Test fail-closed publication decisions without registry writes or credentials."""
import contextlib
import io
import os
import runpy
import sys
import urllib.error
from unittest.mock import patch

class Response(io.BytesIO):
    def __enter__(self):
        return self
    def __exit__(self, *args):
        self.close()

for status, allowed in [(200, False), (404, True), (401, False), (403, False), (429, False), (500, False)]:
    responses = [Response(b'{"token":"disposable-unit-fixture"}'), Response(b'') if status == 200 else urllib.error.HTTPError('https://example.invalid', status, 'fixture', {}, None)]
    with patch.dict(os.environ, {'GITHUB_ACTOR': 'fixture', 'GHCR_TOKEN': 'disposable-unit-fixture'}), patch.object(sys, 'argv', ['check', 'ghcr.io/goggel/dbstats-test-amd64:0.6.0-rc.1']), patch('urllib.request.urlopen', side_effect=responses), contextlib.redirect_stdout(io.StringIO()):
        try:
            runpy.run_path('scripts/check-candidate-absent.py', run_name='__main__')
        except SystemExit as result:
            assert (result.code == 0) == allowed, (status, result.code)
        else:
            raise AssertionError('Probe must make an explicit decision')
print('Candidate absence guard: only 404 permits push; existing tag/auth/rate/server errors rejected.')
