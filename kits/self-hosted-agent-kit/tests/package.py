#!/usr/bin/env python3
"""Run the customer's extracted ZIP, including its real Docker build and task API."""
import hashlib,json,os,pathlib,subprocess,tempfile,zipfile,urllib.request,time
ROOT=pathlib.Path(__file__).resolve().parent.parent
archive=ROOT/'release/self-hosted-agent-kit-2.0.0.zip'
env=dict(os.environ)
for key in ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']:env.pop(key,None)
env.update(DOCKER_HOST='unix:///var/run/docker.sock',NO_PROXY='localhost,127.0.0.1',no_proxy='localhost,127.0.0.1')
def run(args,cwd):
    r=subprocess.run(list(map(str,args)),cwd=cwd,env=env,capture_output=True,text=True)
    if r.returncode:raise RuntimeError(r.stderr[-3000:]+'\n'+r.stdout[-3000:])
    return r.stdout
with tempfile.TemporaryDirectory(prefix='agentkit-package-') as tmp:
    tmp=pathlib.Path(tmp)
    with zipfile.ZipFile(archive) as z:
        for info in z.infolist():
            assert not pathlib.PurePosixPath(info.filename).is_absolute() and '..' not in pathlib.PurePosixPath(info.filename).parts
            out=pathlib.Path(z.extract(info,tmp));out.chmod(info.external_attr>>16&0o777)
    kit=tmp/'self-hosted-agent-kit'
    manifest=json.loads((kit/'RELEASE-MANIFEST.json').read_text())
    for entry in manifest['files']:assert hashlib.sha256((kit/entry['path']).read_bytes()).hexdigest()==entry['sha256']
    assert not (kit/'.env').exists()
    run(['./scripts/setup.sh','--dest',kit,'--no-start','--no-timer'],kit)
    p=kit/'.env';s=p.read_text().replace('COMPOSE_PROJECT_NAME=agentkit','COMPOSE_PROJECT_NAME=agentkit-package-test').replace('PUBLIC_ORIGIN=http://localhost:3080','PUBLIC_ORIGIN=http://localhost:13082').replace('PORT=3080','PORT=13082');p.write_text(s);p.chmod(0o600)
    env['TEST_PORT']='13082'
    compose=['docker','compose','-f','docker-compose.yml','-f','tests/compose.test.yml']
    if os.environ.get('TEST_BUILD_OVERRIDE'):compose+=['-f',os.environ['TEST_BUILD_OVERRIDE']]
    try:
        run(compose+['build','api'],kit)
        run(compose+['up','-d','--no-build','--wait','--wait-timeout','120'],kit)
        config=dict(line.split('=',1) for line in (kit/'.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
        opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(urllib.request.Request(config['PUBLIC_ORIGIN']+'/api/overview',headers={'Authorization':'Bearer '+config['ADMIN_TOKEN']}),timeout=15) as response:
            initial=json.load(response)
        assert initial['counts']=={} and initial['documents']==0 and len(initial['workers'])==1
        print('PASS clean installation contains no seeded tasks, fake metrics or demo agents')
        print(run(['node','tests/acceptance.mjs'],kit),end='')
        # Test bundle-local dependencies and stdio bridge, not the checkout's install.
        run(['npm','ci','--prefix','integrations/mcp','--ignore-scripts'],kit)
        print(run(['node','tests/mcp.mjs'],kit),end='')
        run(['npm','ci','--prefix','tests','--ignore-scripts'],kit)
        print(run(['node','tests/browser.mjs'],kit),end='')
        print(run(['node','tests/auth-rate.mjs'],kit),end='')
        basekit=tmp/'private-install'
        run(['./scripts/setup.sh','--dest',basekit,'--no-start','--no-timer'],kit)
        cfgpath=basekit/'.env';cfgtext=cfgpath.read_text().replace('COMPOSE_PROJECT_NAME=agentkit','COMPOSE_PROJECT_NAME=agentkit-private-install-test').replace('PUBLIC_ORIGIN=http://localhost:3080','PUBLIC_ORIGIN=http://localhost:13083').replace('PORT=3080','PORT=13083');cfgpath.write_text(cfgtext);cfgpath.chmod(0o600)
        cfg=dict(line.split('=',1) for line in cfgtext.splitlines() if '=' in line and not line.startswith('#'))
        try:
            run(['./scripts/setup.sh','--dest',basekit,'--no-timer'],basekit)
            headers={'Authorization':'Bearer '+cfg['ADMIN_TOKEN'],'Content-Type':'application/json'}
            request=urllib.request.Request(cfg['PUBLIC_ORIGIN']+'/api/tasks',headers=headers,data=json.dumps({'kind':'audit'}).encode())
            with opener.open(request,timeout=15) as response:task=json.load(response)['task']
            for attempt in range(30):
                with opener.open(urllib.request.Request(cfg['PUBLIC_ORIGIN']+'/api/tasks/'+task['id'],headers=headers),timeout=15) as response:task=json.load(response)['task']
                if task['status']=='completed':break
                time.sleep(.5)
            assert task['status']=='completed' and 'System check completed' in task['result']
            with opener.open(urllib.request.Request(cfg['PUBLIC_ORIGIN']+'/api/overview',headers=headers),timeout=15) as response:overview=json.load(response)
            assert not any(w['model_configured'] for w in overview['workers'])
            print('PASS full default installer builds, starts and executes a real system check without a model key or test override')
        finally:run(['docker','compose','-f','docker-compose.yml','down','--volumes'],basekit)
        print('PASS versioned ZIP manifest, excluded credentials, dotfiles, Unix modes, same-directory setup, Docker build and end-to-end execution')
    finally:run(compose+['down','--volumes'],kit)
