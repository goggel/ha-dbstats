import subprocess,json,time,pathlib
root=pathlib.Path.cwd(); out=[]
def run(args,sql=None,timeout=30):
 r=subprocess.run(args,input=sql,text=True,capture_output=True,timeout=timeout)
 if r.returncode: raise RuntimeError(r.stderr[-2000:])
 return r.stdout
queries=json.loads(run(['node','-e',"console.log(JSON.stringify(require('./dbstats/app/backend/test/aggregates/queries.cjs').queries('attributes',20)))"]))
seed=json.loads(run(['node','-e',"const s=require('./dbstats/app/backend/test/aggregates/schema.cjs');let a=[];const q=async(sql,p=[])=>{for(const v of p)sql=sql.replace('?',v===null?'NULL':typeof v==='number'?String(v):\"'\"+v.replaceAll(\"'\",\"''\")+\"'\");a.push(sql)};(async()=>{await s.create(q);await s.seed(q);console.log(JSON.stringify(a))})() "]))
for engine,image in [('maria','mariadb:11.8'),('mysql','mysql:8.4')]:
 for lifecycle in range(2):
  name='dbstats-chart-review-'+engine+'-owned';owned=False
  try:
   exists=subprocess.run(['docker','inspect',name],capture_output=True).returncode==0
   assert not exists,'name collision'
   run(['docker','run','-d','--name',name,'--memory=768m','--cpus=1','-e',('MARIADB_ALLOW_EMPTY_ROOT_PASSWORD=1' if engine=='maria' else 'MYSQL_ALLOW_EMPTY_PASSWORD=1'),image],timeout=60);owned=True
   client=['docker','exec','-i',name,('mariadb' if engine=='maria' else 'mysql'),'-uroot','--protocol=tcp','-h127.0.0.1','--batch','--raw','--skip-column-names','--default-character-set=utf8mb4']
   for i in range(60):
    try:run(client,'SELECT 1;',timeout=3);break
    except (RuntimeError,subprocess.TimeoutExpired):time.sleep(.5)
   else:raise Exception('readiness deadline')
   prefix='USE owned_research;'+('SET SESSION max_statement_time=8;' if engine=='maria' else 'SET SESSION max_execution_time=8000;')
   run(client,'CREATE DATABASE owned_research;'+prefix+';'.join(seed)+';',timeout=30)
   version=run(client,'SELECT VERSION();').strip()
   for distribution in ['repeated','distinct']:
    if distribution=='repeated':
     n=11
     while n<300000:
      batch=min(n,300000-n);run(client,prefix+f'INSERT INTO states(metadata_id,attributes_id,last_updated_ts) SELECT metadata_id,attributes_id,last_updated_ts+{n} FROM states LIMIT {batch};');n+=batch
    else:
     run(client,prefix+'INSERT INTO state_attributes SELECT state_id+1000, REPEAT(CHAR(97+MOD(state_id,26)),128) FROM states; UPDATE states SET attributes_id=state_id+1000 WHERE metadata_id IN (1,2,3,4);')
    record={'engine':version,'distribution':distribution,'lifecycle':lifecycle,'rows':300000,'plans':{},'samplesServerMs':{},'results':{}}
    for variant,sql in queries.items():record['plans'][variant]=json.loads(run(client,prefix+'EXPLAIN FORMAT=JSON '+sql+';'))
    all_queries=json.loads(run(['node','-e',"const q=require('./dbstats/app/backend/test/aggregates/queries.cjs');console.log(JSON.stringify(Object.fromEntries(q.names.filter(n=>n!=='attributes').map(n=>[n,q.queries(n,20)]))))"]))
    for chart, variants in all_queries.items():
     record['plans'][chart]={v:json.loads(run(client,prefix+'EXPLAIN FORMAT=JSON '+sql+';')) for v,sql in variants.items()}
    for i in range(3):
     for variant in (['baseline','candidate'] if i%2==0 else ['candidate','baseline']):
      if record.get('timeouts',{}).get(variant): continue
      try:
       lines=run(client,prefix+'SET @start=NOW(6);'+queries[variant]+';SELECT TIMESTAMPDIFF(MICROSECOND,@start,NOW(6))/1000;',timeout=15).strip().splitlines()
       record['samplesServerMs'].setdefault(variant,[]).append(float(lines[-1])); record['results'][variant]=sorted(lines[:-1])
      except RuntimeError as e:
       if '1969' not in str(e) and '3024' not in str(e): raise
       record.setdefault('timeouts',{})[variant]='native 8-second deadline'
    if len(record['results'])==2: assert record['results']['baseline']==record['results']['candidate'],record['results']
    out.append(record);pathlib.Path('docs/chart-query-evidence/results.json').write_text(json.dumps(out,indent=2));print(engine,distribution,record['samplesServerMs'],flush=True)
  except Exception:
   print(run(['docker','logs',name])[-3500:],flush=True)
   raise
  finally:
   if owned:run(['docker','rm','-f',name],timeout=15)
