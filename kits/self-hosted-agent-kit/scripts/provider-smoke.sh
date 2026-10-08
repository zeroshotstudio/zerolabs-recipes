#!/usr/bin/env bash
# Run one small, billable task through the actual configured provider and worker.
source "$(dirname -- "${BASH_SOURCE[0]}")/lib.sh"
require_tools docker python3
[[ -n "$(read_env OPENAI_API_KEY)" && -n "$(read_env OPENAI_MODEL)" ]] || { echo 'Configure OPENAI_API_KEY and OPENAI_MODEL in .env and recreate the worker first.' >&2; exit 1; }
compose exec -T api node --input-type=module <<'JS'
import {setTimeout as delay} from 'node:timers/promises';
const base='http://127.0.0.1:3000',headers={authorization:`Bearer ${process.env.ADMIN_TOKEN}`,'content-type':'application/json'};
async function api(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{...headers,...(body?{'idempotency-key':crypto.randomUUID()}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});const d=await r.json();if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);return d;}
const {task}=await api('/api/tasks',{kind:'assistant',title:'Live provider acceptance check',prompt:'Use the calculate tool to evaluate 19 * 23. Then use create_artifact to save a file named provider-smoke.txt containing only the numerical result. Finally state the result briefly. Do not read any workspace documents.'});
console.log('Submitted live provider test:',task.id);
const deadline=Date.now()+240000;
while(Date.now()<deadline){
 const result=await api('/api/tasks/'+task.id);
 if(['failed','cancelled'].includes(result.task.status))throw new Error(result.task.error||result.task.status);
 if(result.task.status==='completed'){
  const {events}=await api('/api/tasks/'+task.id+'/events');
  const artifact=result.artifacts.find(a=>a.name==='provider-smoke.txt');
  if(!artifact||!events.some(e=>e.type==='tool_finished'&&e.message==='calculate: completed'))throw new Error('The model completed without the required calculation and artifact tools. Inspect the task.');
  const response=await fetch(base+'/api/artifacts/'+artifact.id,{headers});
  if(!response.ok||(await response.text()).trim()!=='437')throw new Error('The saved artifact did not contain the expected result.');
  console.log(JSON.stringify({passed:true,task_id:task.id,model:result.task.model,input_tokens:result.task.input_tokens,output_tokens:result.task.output_tokens}));process.exit(0);
 }
 await delay(1000);
}
throw new Error('Timed out waiting for the saved result. Inspect the task before retrying.');
JS
