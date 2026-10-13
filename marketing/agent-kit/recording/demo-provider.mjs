// Recording-only provider fixture. Never configure this in a production deployment.
// UI, queue, tool execution and persistence still use the unmodified application.
import http from "node:http";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function respond(req, res) {
  if (
    req.url !== "/v1/responses" ||
    req.headers.authorization !== "Bearer fixture-not-a-real-provider-key"
  ) {
    res.writeHead(401);
    return res.end("{}");
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks));
  if (
    body.store !== false ||
    !body.include?.includes("reasoning.encrypted_content") ||
    body.parallel_tool_calls !== false
  ) {
    res.writeHead(400);
    return res.end("{}");
  }
  const prompt = body.input[0].content;
  // The cancellation example intentionally waits for the user to stop it.
  if (prompt.includes("cancellation demonstration")) await pause(60000);
  else await pause(1200);
  if (req.aborted || res.destroyed) return;
  const results = body.input.filter(
    (item) => item.type === "function_call_output",
  );
  const call = (name, args) => ({
    type: "function_call",
    call_id: "demo_call_" + results.length,
    name,
    arguments: JSON.stringify(args),
  });
  const message = (text) => ({
    type: "message",
    role: "assistant",
    content: [{ type: "output_text", text }],
  });
  let output;
  if (results.length === 0) output = call("list_documents", {});
  else if (results.length === 1) {
    const docs = JSON.parse(results[0].output).documents;
    const brief = docs.find((d) => d.title === "Launch brief");
    if (!brief) throw new Error("Add Launch brief before recording the task");
    output = call("read_document", { id: brief.id });
  } else if (results.length === 2)
    output = call("calculate", { expression: "19 * 23" });
  else if (results.length === 3) {
    const value = JSON.parse(results[2].output).result;
    output = call("create_artifact", {
      name: "launch-budget.txt",
      content: `Launch budget\n\n23 evaluation runs at $19 each.\nTotal: $${value}\n\nDemo model response. The calculation and saved artifact were executed by Agent Kit.`,
    });
  } else {
    const value = JSON.parse(results[2].output).result;
    output = message(
      `The launch budget is $${value}.\n\nI read the launch brief, calculated 23 × $19, and saved launch-budget.txt.\n\nScripted demo response; tool execution and saved output are real.`,
    );
  }
  res.setHeader("content-type", "application/json");
  res.end(
    JSON.stringify({
      status: "completed",
      output: [output],
      usage: { input_tokens: 40, output_tokens: 25 },
    }),
  );
}
http
  .createServer((req, res) =>
    respond(req, res).catch((error) => {
      if (req.aborted || res.destroyed) return;
      if (!res.headersSent) res.writeHead(400);
      res.end("{}");
      console.error("Demo fixture:", error.message);
    }),
  )
  .listen(8081, "0.0.0.0");
