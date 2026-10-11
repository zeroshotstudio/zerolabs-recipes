#!/usr/bin/env python3
"""Rehearse a v2 update and rollback using real services and a pre-update backup."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import urllib.request
from release_artifact import extract_verified_bundle

ROOT = Path(__file__).resolve().parent.parent
ENV = dict(os.environ)
for key in ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']:
    ENV.pop(key, None)
ENV.update(DOCKER_HOST='unix:///var/run/docker.sock', NO_PROXY='localhost,127.0.0.1', no_proxy='localhost,127.0.0.1')
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def run(args, cwd):
    result = subprocess.run(list(map(str, args)), cwd=cwd, env=ENV, capture_output=True, text=True, timeout=240)
    if result.returncode:
        raise RuntimeError(f'{args[0]} failed: {result.stderr[-2000:]}\n{result.stdout[-2000:]}')
    return result.stdout


def compose(kit, *args):
    command = ['docker', 'compose', '-f', 'docker-compose.yml']
    if os.environ.get('TEST_BUILD_OVERRIDE'):
        command += ['-f', os.environ['TEST_BUILD_OVERRIDE']]
    return run(command + list(args), kit)


def config(kit):
    return dict(line.split('=', 1) for line in (kit / '.env').read_text().splitlines()
                if '=' in line and not line.startswith('#'))


def api(cfg, path, body=None, token=None):
    headers = {'Authorization': 'Bearer ' + (token or cfg['ADMIN_TOKEN'])}
    if body is not None:
        headers['Content-Type'] = 'application/json'
    request = urllib.request.Request(cfg['PUBLIC_ORIGIN'] + path, headers=headers,
                                     data=json.dumps(body).encode() if body is not None else None)
    with OPENER.open(request, timeout=20) as response:
        return json.load(response)


def prepare(source, destination, project, port):
    run(['bash', source / 'scripts/setup.sh', '--dest', destination, '--no-start', '--no-timer'], source)
    path = destination / '.env'
    text = path.read_text().replace('COMPOSE_PROJECT_NAME=agentkit', f'COMPOSE_PROJECT_NAME={project}')
    text = text.replace('PUBLIC_ORIGIN=http://localhost:3080', f'PUBLIC_ORIGIN=http://localhost:{port}')
    path.write_text(text.replace('PORT=3080', f'PORT={port}'))
    path.chmod(0o600)
    compose(destination, 'build')
    return config(destination)


version = json.loads((ROOT / 'app/package.json').read_text())['version']
archive = ROOT / 'release' / f'self-hosted-agent-kit-{version}.zip'
with tempfile.TemporaryDirectory(prefix='agentkit-update-') as temporary:
    temporary = Path(temporary)
    source = extract_verified_bundle(archive, temporary, version)
    new_source = temporary / 'next-release'
    shutil.copytree(source, new_source)
    marker = '\nUpdate rehearsal: package files copied from the selected release.\n'
    with (new_source / 'README.md').open('a') as output:
        output.write(marker)
    installed, rollback = temporary / 'installed', temporary / 'rollback'
    try:
        cfg = prepare(source, installed, 'agentkit-update-test', 13084)
        saved_env = (installed / '.env').read_bytes()
        run(['bash', 'scripts/setup.sh', '--dest', installed, '--no-timer'], installed)
        document = api(cfg, '/api/documents', {'title': 'Update rehearsal', 'content': 'Preserve this verified context.'})
        task = api(cfg, '/api/tasks', {'kind': 'audit', 'title': 'Before update'})['task']
        for _ in range(40):
            task = api(cfg, '/api/tasks/' + task['id'])['task']
            if task['status'] in ['completed', 'failed', 'cancelled']:
                break
            time.sleep(0.5)
        assert task['status'] == 'completed', task['status']
        api(cfg, '/api/tokens', {'name': 'Update client', 'scopes': ['tasks:read']})
        run(['bash', 'scripts/update.sh', new_source], installed)
        assert (installed / '.env').read_bytes() == saved_env
        assert marker in (installed / 'README.md').read_text()
        assert api(cfg, '/api/tasks/' + task['id'])['task']['result'] == task['result']
        assert api(cfg, '/api/documents/' + document['id'])['content'] == 'Preserve this verified context.'
        assert len(api(cfg, '/api/tokens')['tokens']) == 1
        assert api(cfg, '/health/ready')['status'] == 'ready'
        summary = json.loads((installed / 'state/backup-status.json').read_text())
        assert summary['status'] == 'verified'
        backup = installed / 'backups' / summary['archive']
        run(['python3', 'scripts/archives.py', 'verify', backup], installed)
        print('PASS real v2 update creates a verified backup, copies package files, preserves configuration/data/tokens and becomes ready', flush=True)

        recovered = prepare(source, rollback, 'agentkit-rollback-test', 13085)
        run(['bash', 'scripts/restore.sh', backup], rollback)
        assert api(recovered, '/api/tasks/' + task['id'])['task']['result'] == task['result']
        assert api(recovered, '/api/documents/' + document['id'])['content'] == 'Preserve this verified context.'
        assert api(recovered, '/api/tokens')['tokens'] == []
        assert api(recovered, '/health/ready')['status'] == 'ready'
        print('PASS rollback rehearsal restores the matching application/backup into a clean private project and revokes integration tokens', flush=True)
    finally:
        for kit in [installed, rollback]:
            if (kit / '.env').exists():
                compose(kit, 'down', '--volumes')
