// Execute the actual provider-smoke heredoc against offline API responses.
// The child fetch stub rejects every unrecognized request; no model is called.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const source = await readFile(new URL("../scripts/provider-smoke.sh", import.meta.url), "utf8");
const body = source.match(/<<'JS'\n([\s\S]*?)\nJS(?:\n|$)/)?.[1];
assert.ok(body, "The actual provider-smoke Node heredoc must be present");

function fixture() {
  return {
    task: {
      id: "00000000-0000-4000-8000-000000000001",
      status: "completed",
      model: "offline-fixture-model",
      // pg returns BIGINT task aggregates as strings; event JSON stays numeric.
      input_tokens: "30",
      output_tokens: "7",
    },
    artifacts: [{ id: "00000000-0000-4000-8000-000000000002", name: "provider-smoke.txt" }],
    events: [
      { type: "model_response", data: { input_tokens: 10, output_tokens: 3 } },
      { type: "tool_finished", message: "calculate: completed" },
      { type: "model_response", data: { input_tokens: 20, output_tokens: 4 } },
    ],
    artifact: "437\n",
  };
}

function execute(data) {
  const harness = `
const fixture=${JSON.stringify(data)};
let submitted=false;
globalThis.fetch=async(url,options={})=>{
 if(url==='http://127.0.0.1:3000/api/tasks'&&options.method==='POST'){
  if(submitted)throw new Error('The smoke test must not automatically retry submissions');
  submitted=true;
  return Response.json({task:{id:fixture.task.id}});
 }
 if(!submitted)throw new Error('Task must be submitted before reading acceptance evidence');
 if(url==='http://127.0.0.1:3000/api/tasks/'+fixture.task.id)return Response.json({task:fixture.task,artifacts:fixture.artifacts});
 if(url==='http://127.0.0.1:3000/api/tasks/'+fixture.task.id+'/events')return Response.json({events:fixture.events});
 if(url==='http://127.0.0.1:3000/api/artifacts/00000000-0000-4000-8000-000000000002')return new Response(fixture.artifact);
 throw new Error('Unexpected network request blocked by offline smoke fixture');
};
`;
  return spawnSync(process.execPath, ["--input-type=module"], {
    input: harness + body,
    encoding: "utf8",
    timeout: 5000,
    env: { ...process.env, ADMIN_TOKEN: "offline-acceptance-placeholder" },
  });
}

function rejected(name, edit, expected) {
  const data = fixture();
  edit(data);
  const result = execute(data);
  assert.equal(result.error, undefined, `${name}: child execution failed`);
  assert.notEqual(result.status, 0, `${name}: invalid acceptance unexpectedly passed`);
  assert.match(result.stderr, expected, name);
  assert.ok(!result.stdout.includes('"passed":true'), `${name}: failure emitted a success receipt`);
  console.log(`PASS ${name}`);
}

let result = execute(fixture());
assert.equal(result.error, undefined);
assert.equal(result.status, 0, result.stderr);
const receipt = JSON.parse(result.stdout.trim().split("\n").at(-1));
assert.deepEqual(receipt, {
  passed: true,
  task_id: "00000000-0000-4000-8000-000000000001",
  model: "offline-fixture-model",
  model_responses: 2,
  input_tokens: 30,
  output_tokens: 7,
});
console.log("PASS actual smoke script records matching measured usage across model responses");

const zeroInput = fixture();
zeroInput.events[0].data.input_tokens = zeroInput.events[2].data.input_tokens = 0;
zeroInput.task.input_tokens = "0";
result = execute(zeroInput);
assert.equal(result.status, 0, result.stderr);
console.log("PASS zero input tokens remain valid when measured output is positive");

rejected("missing model responses", data => { data.events = data.events.filter(event => event.type !== "model_response"); }, /no recorded model or model responses/);
rejected("missing model name", data => { data.task.model = " "; }, /no recorded model or model responses/);
rejected("missing response usage", data => { delete data.events[0].data; }, /usage is missing or invalid/);
rejected("partially unmeasured responses", data => { data.events[0].data.input_tokens = null; }, /usage is missing or invalid/);
rejected("negative usage", data => { data.events[0].data.output_tokens = -1; }, /usage is missing or invalid/);
rejected("fractional usage", data => { data.events[0].data.output_tokens = 0.5; }, /usage is missing or invalid/);
rejected("string usage", data => { data.events[0].data.input_tokens = "10"; }, /usage is missing or invalid/);
rejected("unsafe response usage", data => { data.events[0].data.input_tokens = Number.MAX_SAFE_INTEGER + 1; }, /usage is missing or invalid/);
rejected("null task aggregate", data => { data.task.input_tokens = null; }, /does not match/);
for (const value of ["", " ", "030", "+30", "-1", "30.0", "Infinity", "9007199254740992"])
  rejected(`invalid task aggregate ${JSON.stringify(value)}`, data => { data.task.input_tokens = value; }, /does not match/);
rejected("task and response mismatch", data => { data.task.output_tokens = "8"; }, /does not match/);
rejected("aggregate overflow", data => { data.events[0].data.input_tokens = Number.MAX_SAFE_INTEGER; }, /totals exceed/);
rejected("combined usage overflow", data => {
  data.events[0].data = { input_tokens: Number.MAX_SAFE_INTEGER, output_tokens: 0 };
  data.events[2].data = { input_tokens: 0, output_tokens: 1 };
  data.task.input_tokens = String(Number.MAX_SAFE_INTEGER);
  data.task.output_tokens = "1";
}, /positive, safely measured/);
rejected("zero combined usage", data => {
  for (const event of data.events.filter(event => event.type === "model_response")) event.data = { input_tokens: 0, output_tokens: 0 };
  data.task.input_tokens = data.task.output_tokens = "0";
}, /positive, safely measured/);
rejected("incorrect saved artifact", data => { data.artifact = "438"; }, /expected result/);
