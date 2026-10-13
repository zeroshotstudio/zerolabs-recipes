#!/usr/bin/env python3
"""Submit and poll a task using a scoped API token. Python 3.10+, no dependencies."""
import argparse, json, os, time, urllib.error, urllib.parse, urllib.request, uuid
p=argparse.ArgumentParser()
p.add_argument('prompt', nargs='?',default='')
p.add_argument('--kind',choices=['audit','assistant'],default='assistant')
p.add_argument('--timeout',type=int,default=240)
a=p.parse_args()
base=os.environ.get('AGENTKIT_URL','http://localhost:3080').rstrip('/')
u=urllib.parse.urlparse(base)
if u.scheme!='https' and not (u.scheme=='http' and u.hostname in ['localhost','127.0.0.1','::1']): p.error('Use HTTPS except on loopback')
token=os.environ.get('AGENTKIT_TOKEN','')
if not token.startswith('ak_'): p.error('Set AGENTKIT_TOKEN to a scoped token from Connections')
def request(path,body=None):
    headers={'Authorization':'Bearer '+token}
    if body is not None: headers.update({'Content-Type':'application/json','Idempotency-Key':request_id})
    r=urllib.request.Request(base+path,data=json.dumps(body).encode() if body is not None else None,headers=headers)
    try:
        with urllib.request.urlopen(r,timeout=15) as response: return json.load(response)
    except urllib.error.HTTPError as error:
        raise SystemExit(f'Workspace request failed ({error.code}): {json.load(error).get("error","Unknown error")}')
request_id=str(uuid.uuid4())
# Reuse request_id if implementing a transport retry; never invent a new one for the same submission.
task=request('/api/tasks',{'kind':a.kind,'prompt':a.prompt})['task']
print('Task:',task['id'])
deadline=time.monotonic()+a.timeout
while time.monotonic()<deadline:
    task=request('/api/tasks/'+task['id'])['task']
    if task['status'] in ['completed','failed','cancelled']:
        print(task['result'] or task['error'] or task['status'])
        raise SystemExit(0 if task['status']=='completed' else 1)
    time.sleep(1)
raise SystemExit('Polling timed out. The task remains saved; check its ID in the dashboard before submitting again.')
