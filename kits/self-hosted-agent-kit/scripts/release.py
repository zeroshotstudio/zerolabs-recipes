#!/usr/bin/env python3
"""Build a reproducible, secret-free kit ZIP, source digest, manifest and checksums."""
import hashlib, json, os, pathlib, subprocess, zipfile
ROOT=pathlib.Path(__file__).resolve().parent.parent
VERSION=json.loads((ROOT/'app/package.json').read_text())['version']
EXCLUDE_DIRS={'node_modules','__pycache__','.git','backups','state','data','logs','dist','release','test-results','playwright-report'}
EXCLUDE_FILES={'CODEBASE_DIGEST.md','RELEASE-MANIFEST.json','SHA256SUMS'}
def included(path):
    relative=path.relative_to(ROOT)
    return path.is_file() and not path.is_symlink() and not any(p in EXCLUDE_DIRS for p in relative.parts) and path.name not in EXCLUDE_FILES and (not path.name.startswith('.env') or path.name=='.env.example') and path.suffix not in {'.pyc','.log','.zip','.pdf','.png'}
def sha(data):return hashlib.sha256(data).hexdigest()
subprocess.run(['python3',str(ROOT/'scripts/build-docs.py')],check=True)
files=sorted(p for p in ROOT.rglob('*') if included(p))
# Packaging fails if any current installation secret has entered a source file.
secrets=[]
if (ROOT/'.env').exists():
    for line in (ROOT/'.env').read_text().splitlines():
        if '=' in line:
            key,value=line.split('=',1)
            if any(term in key for term in ['PASSWORD','TOKEN','API_KEY']) and len(value.strip())>=24: secrets.append(value.strip().encode())
for path in files:
    if any(secret in path.read_bytes() for secret in secrets):raise SystemExit(f'Refusing to package a credential found in {path.relative_to(ROOT)}')
manifest={'product':'ZeroLabs Agent Kit','version':VERSION,'files':[{'path':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':sha(p.read_bytes()),'mode':'0755' if p.suffix=='.sh' else '0644'} for p in files]}
(ROOT/'RELEASE-MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n')
parts=[f'# Agent Kit {VERSION} · Codebase digest\n\nThis digest contains every packaged text file except dependency lockfiles and generated documentation/metadata. The ZIP and RELEASE-MANIFEST.json include those files. Tests are included; tests/compose.test.yml is never used in a production deployment.\n']
for p in files:
    relative=str(p.relative_to(ROOT))
    if p.name=='package-lock.json' or relative in ['app/public/docs.html','docs/index.html']:continue
    parts.append(f'\n## {relative}\n\nSHA-256: `{sha(p.read_bytes())}`\n\n~~~~{p.suffix.lstrip(".")}\n{p.read_text()}\n~~~~\n')
(ROOT/'CODEBASE_DIGEST.md').write_text(''.join(parts))
output=ROOT/'release';output.mkdir(exist_ok=True)
archive=output/f'self-hosted-agent-kit-{VERSION}.zip'
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for p in files+[ROOT/'RELEASE-MANIFEST.json',ROOT/'CODEBASE_DIGEST.md']:
        info=zipfile.ZipInfo('self-hosted-agent-kit/'+str(p.relative_to(ROOT)),date_time=(2026,1,1,0,0,0))
        info.create_system=3;info.compress_type=zipfile.ZIP_DEFLATED
        mode=0o755 if p.suffix=='.sh' else 0o644
        info.external_attr=(0o100000|mode)<<16
        z.writestr(info,p.read_bytes())
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert 'self-hosted-agent-kit/.env.example' in z.namelist()
    assert not any('/node_modules/' in n or n.endswith('/.env') for n in z.namelist())
    assert z.getinfo('self-hosted-agent-kit/scripts/setup.sh').external_attr>>16&0o111
    for entry in manifest['files']:assert sha(z.read('self-hosted-agent-kit/'+entry['path']))==entry['sha256']
(output/'CODEBASE_DIGEST.md').write_bytes((ROOT/'CODEBASE_DIGEST.md').read_bytes())
(output/'SHA256SUMS').write_text(''.join(f'{sha(p.read_bytes())}  {p.name}\n' for p in [archive,output/'CODEBASE_DIGEST.md']))
print(json.dumps({'archive':str(archive),'files':len(files)+2,'bytes':archive.stat().st_size,'sha256':sha(archive.read_bytes())},indent=2))
