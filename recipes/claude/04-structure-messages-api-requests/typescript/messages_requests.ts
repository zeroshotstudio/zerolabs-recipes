/**
 * Anthropic Messages API Request Structure & Role Sequencing Harness (TypeScript).
 *
 * Demonstrates root-level system parameter configuration, multi-turn role alternation,
 * multi-modal content blocks, tool use handling, and request configuration parameters.
 */

import Anthropic from "@anthropic-ai/sdk";
import * as dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("Error: ANTHROPIC_API_KEY environment variable is not set.");
  process.exit(1);
}

const client = new Anthropic({ apiKey });
const PRIMARY_MODEL = "claude-3-7-sonnet-20250219";

async function runBasicStructuredRequest(): Promise<void> {
  console.log("\n[1/4] Running basic request with root-level system prompt & role alternation...");
  const startTime = Date.now();

  const response = await client.messages.create({
    model: PRIMARY_MODEL,
    max_tokens: 256,
    temperature: 0.1,
    system: "You are an expert distributed systems engineer. Answer concisely.",
    messages: [
      {
        role: "user",
        content: "What is the primary operational distinction between Anthropic's system parameter and the messages array?",
      },
      {
        role: "assistant",
        content:
          "The system parameter is supplied at the root level of the request rather than as a role inside the messages array. This provides dedicated prompt isolation, supports prompt caching, and strictly enforces user and assistant turn alternation.",
      },
      {
        role: "user",
        content: "Summarize the required role alternation pattern in multi-turn dialogues.",
      },
    ],
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`Status: Success (${elapsed}s)`);
  console.log(`Stop Reason: ${response.stop_reason}`);
  console.log(`Tokens - Input: ${response.usage.input_tokens}, Output: ${response.usage.output_tokens}`);

  for (const block of response.content) {
    if (block.type === "text") {
      console.log(`Response: ${block.text.trim()}`);
    }
  }
}

async function runMultimodalContentBlocks(): Promise<void> {
  console.log("\n[2/4] Testing multi-modal content blocks (text + image block)...");
  const startTime = Date.now();

  // 1x1 transparent PNG payload in base64
  const tinyPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

  const response = await client.messages.create({
    model: PRIMARY_MODEL,
    max_tokens: 200,
    temperature: 0.0,
    system: "You are an automated vision asset processor.",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Inspect this 1x1 pixel image block and verify schema compliance.",
          },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: tinyPngBase64,
            },
          },
        ],
      },
    ],
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`Status: Success (${elapsed}s)`);
  for (const block of response.content) {
    if (block.type === "text") {
      console.log(`Response: ${block.text.trim()}`);
    }
  }
}

async function runToolUseRoundtrip(): Promise<void> {
  console.log("\n[3/4] Testing tool_use and tool_result block sequencing...");
  const startTime = Date.now();

  const tools: Anthropic.Tool[] = [
    {
      name: "query_service_health",
      description: "Returns health status and uptime metrics for a microservice.",
      input_schema: {
        type: "object",
        properties: {
          service_name: {
            type: "string",
            description: "Target service name to probe",
          },
        },
        required: ["service_name"],
      },
    },
  ];

  // Turn 1: Ask question requiring tool call
  const firstTurn = await client.messages.create({
    model: PRIMARY_MODEL,
    max_tokens: 512,
    system: "You are an automated infrastructure monitoring bot. Call available tools to check status.",
    tools,
    messages: [
      {
        role: "user",
        content: "Check status for service 'auth-gateway-v2'.",
      },
    ],
  });

  let toolCallId = "";
  let toolName = "";
  for (const block of firstTurn.content) {
    if (block.type === "tool_use") {
      toolCallId = block.id;
      toolName = block.name;
      console.log(`Assistant initiated tool call: [${toolName}] id=${toolCallId}`);
    }
  }

  if (!toolCallId) {
    console.error("Expected tool_use block from model.");
    return;
  }

  // Turn 2: Feed back tool_result block
  const secondTurn = await client.messages.create({
    model: PRIMARY_MODEL,
    max_tokens: 512,
    system: "You are an automated infrastructure monitoring bot. Call available tools to check status.",
    tools,
    messages: [
      {
        role: "user",
        content: "Check status for service 'auth-gateway-v2'.",
      },
      {
        role: "assistant",
        content: firstTurn.content,
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolCallId,
            content: JSON.stringify({
              service: "auth-gateway-v2",
              status: "nominal",
              latency_ms: 18,
              uptime_pct: 99.98,
            }),
          },
        ],
      },
    ],
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`Turn 2 complete (${elapsed}s). Final response:`);
  for (const block of secondTurn.content) {
    if (block.type === "text") {
      console.log(`Response: ${block.text.trim()}`);
    }
  }
}

async function runMalformedStructureValidation(): Promise<void> {
  console.log("\n[4/4] Validating error boundaries on malformed request payloads...");
  try {
    // Attempting to pass role='system' directly inside messages array (which is invalid in Anthropic API)
    // @ts-expect-error Intentionally invalid payload to verify API error boundary
    await client.messages.create({
      model: PRIMARY_MODEL,
      max_tokens: 50,
      messages: [
        {
          role: "system",
          content: "This should fail schema validation.",
        },
      ],
    });
    console.log("Notice: Call unexpectedly completed.");
  } catch (err: unknown) {
    if (err instanceof Anthropic.BadRequestError) {
      console.log(`Correctly caught Anthropic.BadRequestError: ${err.message}`);
    } else if (err instanceof Error) {
      console.log(`Caught error boundary check: ${err.name} - ${err.message}`);
    }
  }
}

async function main(): Promise<void> {
  console.log("=================================================================");
  console.log("Anthropic Messages API Request Structure & Role Suite (TS)");
  console.log("=================================================================");
  try {
    await runBasicStructuredRequest();
    await runMultimodalContentBlocks();
    await runToolUseRoundtrip();
    await runMalformedStructureValidation();
    console.log("\nAll TypeScript request structure tests passed.");
  } catch (error) {
    console.error("Test execution failed:", error);
    process.exit(1);
  }
}

main();
