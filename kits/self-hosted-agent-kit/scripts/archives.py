#!/usr/bin/env python3
"""Atomic backup archives; extraction accepts exactly the two expected members."""
import datetime, hashlib, io, json, os, pathlib, re, sys, tarfile, tempfile
VERSION = '2.0.0'
def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def digest(path):
    h = hashlib.sha256()
    with open(path,'rb') as f:
        for part in iter(lambda:f.read(1024*1024),b''): h.update(part)
    return h.hexdigest()
def atomic_json(path, data):
    path = pathlib.Path(path)
    fd, tmp = tempfile.mkstemp(prefix='.status.', dir=path.parent)
    try:
        with os.fdopen(fd,'w') as f: json.dump(data,f); f.flush(); os.fsync(f.fileno())
        os.chmod(tmp,0o644)
        os.replace(tmp,path)
    finally:
        if os.path.exists(tmp): os.unlink(tmp)
def verify(path, output=None):
    with tarfile.open(path, 'r:gz') as tar:
        members = tar.getmembers()
        if len(members) != 2 or {m.name for m in members} != {'manifest.json','database.dump'} or any(not m.isfile() for m in members): raise ValueError('Unexpected archive members')
        manifest_member = tar.getmember('manifest.json')
        if manifest_member.size > 16384: raise ValueError('Invalid manifest size')
        manifest = json.load(tar.extractfile(manifest_member))
        if manifest.get('format') != 1 or manifest.get('version') != VERSION: raise ValueError('Backup version mismatch; restore with the same kit version')
        dump = tar.getmember('database.dump')
        if dump.size != manifest.get('bytes') or dump.size < 32: raise ValueError('Invalid dump size')
        h = hashlib.sha256()
        target = open(output,'xb') if output else None
        try:
            with tar.extractfile(dump) as f:
                for part in iter(lambda:f.read(1024*1024),b''):
                    h.update(part)
                    if target: target.write(part)
        finally:
            if target: target.close()
        if h.hexdigest() != manifest.get('sha256'): raise ValueError('Database checksum mismatch')
        return manifest

def main():
    command, *args = sys.argv[1:]
    if command == 'pack':
        source, directory = map(pathlib.Path,args)
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        name = f'agentkit-{stamp}.tar.gz'; destination = directory/name
        fd, temporary = tempfile.mkstemp(prefix='.archive.',dir=directory); os.close(fd)
        manifest = {'format':1,'version':VERSION,'created_at':now(),'bytes':source.stat().st_size,'sha256':digest(source)}
        try:
            with tarfile.open(temporary,'w:gz') as tar:
                tar.add(source,arcname='database.dump')
                value = json.dumps(manifest).encode(); entry = tarfile.TarInfo('manifest.json'); entry.size=len(value); entry.mode=0o600
                tar.addfile(entry,io.BytesIO(value))
            verify(temporary)
            with open(temporary,'rb') as f: os.fsync(f.fileno())
            os.replace(temporary,destination)
            print(destination)
        finally:
            if os.path.exists(temporary): os.unlink(temporary)
    elif command == 'verify':
        print(json.dumps(verify(args[0], args[1] if len(args)>1 else None)))
    elif command == 'compare':
        h=hashlib.sha256()
        for part in iter(lambda:sys.stdin.buffer.read(1024*1024),b''): h.update(part)
        if h.hexdigest() != digest(args[0]): raise ValueError('Offsite archive checksum mismatch')
    elif command == 'status':
        archive, path, offsite=args; verify(archive)
        atomic_json(path,{'status':'verified','verified_at':now(),'attempted_at':now(),'archive':pathlib.Path(archive).name,'bytes':pathlib.Path(archive).stat().st_size,'sha256':digest(archive),'offsite':offsite})
    elif command == 'failed':
        path=pathlib.Path(args[0]); old={}
        try: old=json.loads(path.read_text())
        except (OSError,ValueError): pass
        old.update(status='failed',attempted_at=now(),message='The latest backup attempt failed. Check the host backup logs; older verified archives were retained.')
        atomic_json(path,old)
    elif command == 'prune':
        directory, keep=args; keep=int(keep)
        if not 2 <= keep <= 365: raise ValueError('BACKUP_KEEP must be between 2 and 365')
        archives=sorted(p for p in pathlib.Path(directory).glob('agentkit-*.tar.gz') if re.fullmatch(r'agentkit-\d{8}T\d{12}Z\.tar\.gz',p.name))
        for path in archives[:-keep]: path.unlink()
    else: raise ValueError('Unknown archive operation')
if __name__ == '__main__':
    try: main()
    except Exception as error: sys.exit(f'Archive operation failed: {error}')
