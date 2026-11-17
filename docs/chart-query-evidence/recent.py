"""Owned native-driver evidence; no persistent volumes, cleanup on every exit."""
import subprocess, json, os, time, pathlib, sys
root=pathlib.Path(__file__).resolve().parents[2]
def run(args, **kw):
 r=subprocess.run(args,text=True,capture_output=True,**kw)
 if r.returncode:raise RuntimeError(r.stdout+r.stderr)
 return r.stdout
for engine,image,port in [('maria','mariadb:11.8',3306),('mysql','mysql:8.4',3306),('pg16','postgres:16',5432),('pg15','postgres:15',5432)]:
 if len(sys.argv)>1 and engine not in sys.argv[1:]:continue
 name='dbstats-recent-owned-'+engine
 created=False
 try:
  assert subprocess.run(['docker','inspect',name],capture_output=True).returncode != 0
  env=['-e','POSTGRES_PASSWORD=owned','-e','POSTGRES_DB=owned'] if port==5432 else ['-e',('MARIADB_ROOT_PASSWORD=owned' if engine=='maria' else 'MYSQL_ROOT_PASSWORD=owned'),'-e',('MARIADB_DATABASE=owned' if engine=='maria' else 'MYSQL_DATABASE=owned')]
  run(['docker','run','-d','--name',name,'--memory=768m','--cpus=1','-p',f'127.0.0.1::{port}',*env,image]);created=True
  for attempt in range(120):
   cmd=['docker','exec',name]+(['pg_isready','-h','127.0.0.1','-U','postgres'] if port==5432 else [('mariadb' if engine=='maria' else 'mysql'),'-uroot','-powned','-h127.0.0.1','-e','SELECT 1'])
   if subprocess.run(cmd,capture_output=True).returncode==0:break
   time.sleep(.5)
  else:raise RuntimeError('readiness timeout')
  binding=run(['docker','port',name,str(port)]).strip().split(':')[-1]
  driver='postgres' if port==5432 else 'mysql'
  url=f'{driver}://'+('postgres' if port==5432 else 'root')+f':owned@127.0.0.1:{binding}/owned'
  evidence=root/'docs/chart-query-evidence'/f'recent-{engine}.json'
  result=run(['node','test/recent-attributes.cjs'],cwd=root/'dbstats/app/backend',env={**os.environ,'RECENT_DRIVER':driver,'RECENT_URL':url,'RECENT_EVIDENCE':str(evidence)},timeout=180)
  print(engine,result,flush=True)
 finally:
  if created:run(['docker','rm','-f','--volumes',name])
