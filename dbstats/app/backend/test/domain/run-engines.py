"""Disposable domain fixtures only; no external connection options accepted."""
import json
import pathlib
import sqlite3
import subprocess
import tempfile
import time

ROOT = pathlib.Path(__file__).resolve().parents[2]
PODMAN = ['/opt/homebrew/bin/podman', '--connection', 'podman-machine-default']
DATABASE = 'dbstats_domain_006a'
NAMES = {'mariadb': 'dbstats-domain-006a-maria', 'mysql': 'dbstats-domain-006a-mysql', 'postgres': 'dbstats-domain-006a-pg'}


def run(args, data=None, timeout=20):
    return subprocess.run(args, input=data, text=True, capture_output=True, timeout=timeout, check=True, cwd=ROOT).stdout


queries = json.loads(run(['node', '-r', 'ts-node/register', '-e',
    "const {domainQuery}=require('./src/event/domain/domain-query'); console.log(JSON.stringify(Object.fromEntries(['sqlite','mysql','mariadb','postgres'].map(e=>[e,[domainQuery(e,100),domainQuery(e,2)]]))))"], timeout=30))

payloads = ['{"domain":"light"}', '{}', '{bad', '{"domain":null}', '{"domain":123}', '{"domain":false}', '{"domain":[]}', '{"domain":{}}', '{"domain":""}', '{"domain":"温度😀"}', '{"domain":"A"}', '{"domain":"a"}', '{"domain":"a "}', '{"domain":"__proto__"}', None]
refs = [1]*100 + list(range(2,16)) + [None,999] + [10,10]
expected = [('light',100), ('温度😀',3), ('A',1), ('__proto__',1), ('a',1), ('a ',1)]


def setup(engine):
    def literal(value):
        return 'NULL' if value is None else "'" + value.replace("'", "''") + "'"
    return ('SET sql_mode=\'NO_BACKSLASH_ESCAPES\'; SET NAMES utf8mb4; ' if engine in ('mysql','mariadb') else '') + '''CREATE TABLE event_data(data_id INTEGER PRIMARY KEY, shared_data TEXT);
CREATE TABLE events(event_id INTEGER PRIMARY KEY, data_id INTEGER);
''' + '\n'.join(f'INSERT INTO event_data VALUES ({i},{literal(v)});' for i,v in enumerate(payloads,1)) + '\nINSERT INTO event_data VALUES (9999,\'{"domain":"unreferenced"}\');\n' + '\n'.join(f'INSERT INTO events VALUES ({i},{literal(v) if v is None else v});' for i,v in enumerate(refs,1))


with tempfile.TemporaryDirectory(prefix='dbstats-domain-006a-') as folder:
    path = pathlib.Path(folder)/'dbstats_domain_006a.sqlite'
    assert path.name == 'dbstats_domain_006a.sqlite' and path.parent.name.startswith('dbstats-domain-006a-')
    with sqlite3.connect(path) as db:
        db.executescript(setup('sqlite'))
    with sqlite3.connect(f'file:{path}?mode=ro', uri=True) as db:
        assert db.execute(queries['sqlite'][0]).fetchall() == expected
        assert db.execute(queries['sqlite'][1]).fetchall() == expected[:2]
        try:
            db.execute('DELETE FROM events')
            raise AssertionError('read-only check failed')
        except sqlite3.OperationalError:
            pass
        print('PASS SQLite', sqlite3.sqlite_version, '100 references=100; edge cases; limit; readonly')
    with sqlite3.connect(path) as db:
        db.execute('DELETE FROM events')
    with sqlite3.connect(f'file:{path}?mode=ro', uri=True) as db:
        assert db.execute(queries['sqlite'][0]).fetchall() == []

for engine, image in [('mariadb','mariadb:11'),('mysql','mysql:8'),('postgres','postgres:16')]:
    name = NAMES[engine]
    # Fixed fixture container and database allowlist, no host ports or external URI.
    assert name in NAMES.values() and DATABASE == 'dbstats_domain_006a'
    if engine == 'postgres':
        env = ['-e','POSTGRES_HOST_AUTH_METHOD=trust','-e',f'POSTGRES_DB={DATABASE}']
        client = ['psql','-U','postgres','-d',DATABASE,'-At','-F','\t','-v','ON_ERROR_STOP=1']
    else:
        env = ['-e', 'MARIADB_ALLOW_EMPTY_ROOT_PASSWORD=1' if engine == 'mariadb' else 'MYSQL_ALLOW_EMPTY_PASSWORD=1','-e',f'MYSQL_DATABASE={DATABASE}']
        client = ['mariadb' if engine == 'mariadb' else 'mysql','-uroot','--default-character-set=utf8mb4','-N','-B',DATABASE]
    run(PODMAN+['run','-d','--name',name]+env+['docker.io/library/'+image])
    try:
        for attempt in range(30):
            try:
                run(PODMAN+['exec','-i',name]+client, 'SELECT 1;', timeout=3)
                break
            except (subprocess.CalledProcessError,subprocess.TimeoutExpired):
                if attempt == 29: raise
                time.sleep(1)
        def sql(statement):
            return run(PODMAN+['exec','-i',name]+client,statement)
        sql(setup(engine))
        version = sql('SELECT version();').strip()
        def result(query):
            return [(a,int(b)) for a,b in (line.split('\t') for line in sql(query).splitlines())]
        assert result(queries[engine][0]) == expected, (engine,result(queries[engine][0]))
        assert result(queries[engine][1]) == expected[:2]
        sql('DELETE FROM events;')
        assert result(queries[engine][0]) == []
        print('PASS',engine,version,'100 references=100; edge cases; limit; empty')
    finally:
        run(PODMAN+['rm','-f',name])
