import test from "node:test";
import assert from "node:assert/strict";
import { calculate, executeTool } from "../lib/tools.js";
import { jobInput } from "../lib/jobs.js";
import { publicOrigin, providerURL } from "../lib/config.js";
test("arithmetic handles precedence and unary signs without evaluating code", () => {
  assert.equal(calculate("(12 + 8) * 3"), 60);
  assert.equal(calculate("-2 * (3 + .5)"), -7);
  for (const expression of [
    "process.exit()",
    "1/0",
    "2**4",
    "(1+2",
    "1 2",
    ". 1",
    "NaN",
    "9".repeat(201),
  ])
    assert.throws(() => calculate(expression));
});
test("model tools reject unsupported capabilities and extra arguments", async () => {
  await assert.rejects(
    executeTool(null, null, null, "run_shell", { command: "echo denied" }),
  );
  await assert.rejects(
    executeTool(null, null, null, "calculate", {
      expression: "1+2",
      file: "/etc/passwd",
    }),
  );
  assert.deepEqual(
    await executeTool(null, null, null, "calculate", { expression: "4*(6-2)" }),
    { result: 16 },
  );
});
test("task validation rejects invalid input and makes explicit system checks", () => {
  assert.equal(jobInput({ kind: "audit" }).kind, "audit");
  for (const input of [
    {},
    { kind: "shell", prompt: "x" },
    { prompt: " " },
    { prompt: "x".repeat(16001) },
    { prompt: "x", title: 3 },
  ])
    assert.throws(() => jobInput(input));
});
test("remote access and provider URLs reject insecure or credential-bearing URLs", () => {
  const before = { ...process.env };
  try {
    process.env.PUBLIC_ORIGIN = "http://example.com";
    assert.throws(publicOrigin);
    process.env.PUBLIC_ORIGIN = "https://operator:secret@example.com";
    assert.throws(publicOrigin);
    process.env.PUBLIC_ORIGIN = "http://localhost:3080";
    assert.equal(publicOrigin(), "http://localhost:3080");
    process.env.OPENAI_BASE_URL = "http://example.com/v1";
    delete process.env.ALLOW_INSECURE_MODEL_ENDPOINT;
    assert.throws(providerURL);
    process.env.OPENAI_BASE_URL = "https://api.openai.com/v1";
    assert.equal(providerURL(), "https://api.openai.com/v1/responses");
  } finally {
    for (const k of [
      "PUBLIC_ORIGIN",
      "OPENAI_BASE_URL",
      "ALLOW_INSECURE_MODEL_ENDPOINT",
    ]) {
      if (before[k] === undefined) delete process.env[k];
      else process.env[k] = before[k];
    }
  }
});
