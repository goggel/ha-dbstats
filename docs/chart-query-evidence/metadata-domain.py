# Own bounded fixture; invokes the common helpers without running benchmarks.
exec(open('docs/chart-query-evidence/run.py').read().split('for engine,image')[0])
plans=[]
domain=run(['node','-e',"console.log(require('./dbstats/app/backend/dist/backend/src/event/domain/domain-query').domainQuery('mysql',20))"]).strip()
for engine,image in [('maria','mariadb:11.8'),('mysql','mysql:8.4')]:
 name='dbstats-chart-extra-'+engine+'-owned';owned=False
 try:
  assert subprocess.run(['docker','inspect',name],capture_output=True).returncode!=0
  run(['docker','run','-d','--name',name,'--memory=768m','--cpus=1','-e',('MARIADB_ALLOW_EMPTY_ROOT_PASSWORD=1' if engine=='maria' else 'MYSQL_ALLOW_EMPTY_PASSWORD=1'),image],timeout=60);owned=True
  client=['docker','exec','-i',name,('mariadb' if engine=='maria' else 'mysql'),'-uroot','--protocol=tcp','-h127.0.0.1','--batch','--raw','--skip-column-names']
  for i in range(60):
   try:run(client,'SELECT 1;',timeout=3);break
   except (RuntimeError,subprocess.TimeoutExpired):time.sleep(.5)
  else:raise Exception('readiness deadline')
  prefix='USE owned_research;'+('SET SESSION max_statement_time=8;' if engine=='maria' else 'SET SESSION max_execution_time=8000;')
  run(client,'CREATE DATABASE owned_research;'+prefix+';'.join(seed)+';ALTER TABLE events ADD data_id INT, ADD INDEX ix_events_data_id(data_id);CREATE TABLE event_data(data_id INT PRIMARY KEY,shared_data LONGBLOB);INSERT INTO event_data VALUES(1,\'{"domain":"light"}\'),(2,\'{"domain":"sensor"}\');UPDATE events SET data_id=1+MOD(event_id,2);')
  n=11
  while n<300000:
   batch=min(n,300000-n)
   for table,cols in [('events','event_type_id,time_fired_ts,data_id'),('statistics','metadata_id,start_ts'),('statistics_short_term','metadata_id,start_ts')]:
    select_cols=cols.replace('start_ts','start_ts+'+str(n)).replace('time_fired_ts','time_fired_ts+'+str(n))
    run(client,prefix+f'INSERT INTO {table}({cols}) SELECT {select_cols} FROM {table} LIMIT {batch};')
   n+=batch
  sqls={n:q['baseline'] for n,q in json.loads(run(['node','-e',"const q=require('./dbstats/app/backend/test/aggregates/queries.cjs');console.log(JSON.stringify(Object.fromEntries(['events','statistics','statistics_short_term'].map(n=>[n,q.queries(n,20)]))))"])).items()}
  sqls.update(domain=domain,table_rows='SELECT table_name type,TABLE_ROWS cnt FROM information_schema.TABLES WHERE table_schema=DATABASE() ORDER BY TABLE_ROWS DESC LIMIT 20',table_size='SELECT table_name type,ROUND((data_length+index_length)/1024/1024,2) cnt FROM information_schema.TABLES WHERE table_schema=DATABASE() ORDER BY data_length+index_length DESC LIMIT 20')
  plans.append({'engine':run(client,'SELECT VERSION();').strip(),'rows_per_fact':300000,'plans':{n:json.loads(run(client,prefix+'EXPLAIN FORMAT=JSON '+sql+';')) for n,sql in sqls.items()}})
  pathlib.Path('docs/chart-query-evidence/extra-plans.json').write_text(json.dumps(plans,indent=2))
 finally:
  if owned:run(['docker','rm','-f',name],timeout=15)
