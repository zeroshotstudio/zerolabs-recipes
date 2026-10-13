#!/usr/bin/env python3
"""Destructive tests are restricted to an isolated Compose project containing 'test'."""
import hashlib, io, json, os, pathlib, shutil, subprocess, tarfile, tempfile, time, urllib.request
ROOT=pathlib.Path(__file__).resolve().parent.parent
def values(path):return dict(line.split('=',1) for line in path.read_text().splitlines() if '=' in line and not line.startswith('#'))
config=values(ROOT/'.env');assert 'test' in config['COMPOSE_PROJECT_NAME']
ENV=dict(os.environ)
for key in ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']:ENV.pop(key,None)
ENV.update(DOCKER_HOST='unix:///var/run/docker.sock',NO_PROXY='localhost,127.0.0.1',no_proxy='localhost,127.0.0.1')
checks=[]
def check(name):checks.append(name);print('PASS',name,flush=True)
def run(args,cwd=ROOT,ok=True):
    r=subprocess.run(list(map(str,args)),cwd=cwd,env=ENV,capture_output=True,text=True)
    if ok and r.returncode:raise RuntimeError(f'Command failed ({args[0]}): {r.stderr[-2000:]} {r.stdout[-1000:]}')
    return r
def compose(*args,cwd=ROOT):return run(['docker','compose','-f','docker-compose.yml',*args],cwd=cwd)
def get(base,path,key):
    request=urllib.request.Request(base+path,headers={'Authorization':'Bearer '+key})
    with urllib.request.urlopen(request,timeout=20) as r:return json.load(r)
def hash_file(path):return hashlib.sha256(path.read_bytes()).hexdigest()
old_env=(ROOT/'.env').read_text()
with tempfile.TemporaryDirectory(prefix='agentkit-ops-') as temp:
    temp=pathlib.Path(temp);offsite=temp/'offsite';offsite.mkdir()
    try:
        (ROOT/'.env').write_text(old_env.replace('BACKUP_REMOTE=',f'BACKUP_REMOTE={offsite}'))
        run(['bash','scripts/backup.sh'])
        summary=json.loads((ROOT/'state/backup-status.json').read_text());assert summary['status']=='verified' and summary['offsite']=='verified'
        archive=ROOT/'backups'/summary['archive'];assert hash_file(archive)==hash_file(offsite/archive.name)
        assert archive.stat().st_mode&0o777==0o600
        run(['python3','scripts/archives.py','verify',archive]);check('backup creates a private verified archive and a real rclone copy with matching SHA-256')
        before=set((ROOT/'backups').glob('agentkit-*.tar.gz'));compose('stop','postgres')
        failed=run(['bash','scripts/backup.sh'],ok=False);assert failed.returncode!=0
        assert set((ROOT/'backups').glob('agentkit-*.tar.gz'))==before
        assert json.loads((ROOT/'state/backup-status.json').read_text())['status']=='failed'
        assert not list((ROOT/'backups').glob('.pending.*'))
        compose('start','postgres');check('database outage makes backup fail, preserves older archives, cleans temporary files and records failure')
        # A corrupted or path-traversing archive is rejected before any database operation.
        corrupt=temp/'corrupt.tar.gz';data=bytearray(archive.read_bytes());data[len(data)//2]^=0xff;corrupt.write_bytes(data)
        assert run(['python3','scripts/archives.py','verify',corrupt],ok=False).returncode!=0
        malicious=temp/'malicious.tar.gz'
        with tarfile.open(malicious,'w:gz') as tf:
            entry=tarfile.TarInfo('../outside');entry.size=1;tf.addfile(entry,io.BytesIO(b'x'))
        assert run(['python3','scripts/archives.py','verify',malicious],ok=False).returncode!=0
        assert not (temp.parent/'outside').exists();check('corrupt and path-traversing archives are rejected')
        # Missing dependency / bad retention cannot delete the most recent known-good archive.
        prune=run(['python3','scripts/archives.py','prune',ROOT/'backups','0'],ok=False);assert prune.returncode!=0 and archive.exists()
        check('invalid retention values cannot remove the verified backup')
        unrelated=temp/'unrelated';unrelated.mkdir();(unrelated/'keep.txt').write_text('preserve')
        assert run(['bash','scripts/setup.sh','--dest',unrelated,'--no-start','--no-timer'],ok=False).returncode!=0
        assert (unrelated/'keep.txt').read_text()=='preserve' and not (unrelated/'app').exists()
        check('installer refuses unrelated occupied directories without copying files')
        install=temp/'installed'
        run(['bash','scripts/setup.sh','--dest',install,'--no-start','--no-timer'])
        assert (install/'.env.example').exists() and (install/'.env').stat().st_mode&0o777==0o600
        assert (install/'scripts/backup.sh').stat().st_mode&0o111
        saved=(install/'.env').read_bytes()
        run(['bash','scripts/setup.sh','--dest',install,'--no-start','--no-timer'],cwd=install)
        assert (install/'.env').read_bytes()==saved
        assert saved!=(ROOT/'.env').read_bytes();check('fresh and same-directory installation preserve dotfiles, executable modes and existing credentials')
        cfg=(install/'.env').read_text().replace('COMPOSE_PROJECT_NAME=agentkit','COMPOSE_PROJECT_NAME=agentkit-restore-test').replace('PORT=3080','PORT=13081').replace('PUBLIC_ORIGIN=http://localhost:3080','PUBLIC_ORIGIN=http://localhost:13081')
        (install/'.env').write_text(cfg)
        cfg=values(install/'.env')
        original=get(config['PUBLIC_ORIGIN'],'/api/tasks?status=completed',config['ADMIN_TOKEN'])
        assert original['tasks'],'Need completed tasks from acceptance tests before restore'
        known_id=original['tasks'][0]['id'];known=get(config['PUBLIC_ORIGIN'],'/api/tasks/'+known_id,config['ADMIN_TOKEN'])['task']
        # Use the source archive taken before subsequent tests; pick a task actually included in it.
        run(['bash','scripts/restore.sh',archive],cwd=install)
        restored=get(cfg['PUBLIC_ORIGIN'],'/api/tasks/'+known_id,cfg['ADMIN_TOKEN'])['task']
        assert restored['result']==known['result'] and restored['status']=='completed'
        assert get(cfg['PUBLIC_ORIGIN'],'/api/documents',cfg['ADMIN_TOKEN'])['documents']
        assert get(cfg['PUBLIC_ORIGIN'],'/api/tokens',cfg['ADMIN_TOKEN'])['tokens']==[]
        assert get(cfg['PUBLIC_ORIGIN'],'/health/ready',cfg['ADMIN_TOKEN'])['status']=='ready'
        check('clean-project restore recovers actual results and documents, revokes tokens and becomes ready')
        rejected=run(['bash','scripts/restore.sh',archive],cwd=install,ok=False);assert rejected.returncode!=0
        assert get(cfg['PUBLIC_ORIGIN'],'/api/tasks/'+known_id,cfg['ADMIN_TOKEN'])['task']['result']==known['result']
        check('restore refuses an occupied workspace without losing its data')
        compose('down','--volumes',cwd=install)
    finally:
        (ROOT/'.env').write_text(old_env);(ROOT/'.env').chmod(0o600)
        compose('start','postgres')
        if 'install' in locals() and (install/'.env').exists():compose('down','--volumes',cwd=install)
        # Publish a successful final backup after the intentional outage test.
        run(['bash','scripts/backup.sh'])
print(json.dumps({'passed':len(checks),'checks':checks},indent=2))
