/**
 * Server-Sent Events (SSE) Streaming with Anthropic Claude in TypeScript.
 * Demonstrates both manual event listening and the high-level createMessageStream helper.
 * Covers event types, time-to-first-token instrumentation, and final message extraction.
 */

import Anthropic from "@anthropic-ai/sdk";
import * as dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.ANTHROPIC_API_KEY;
const model = process.env.ANTHROPIC_MODEL || "claude-3-7-sonnet-20250219";

if (!apiKey) {
  console.error("Error: ANTHROPIC_API_KEY is not defined in environment variables or .env");
  process.exit(1);
}

const client = new Anthropic({ apiKey });

/**
 * Demonstrates low-level event iteration using async iterable over stream response.
 */
async function demonstrateRawStream(): Promise<void> {
  console.log("\n--- 1. Low-Level Event Stream (Async Iterable) ---");
  const startTime = Date.now();
  let firstTokenLogged = false;

  try {
    const stream = await client.messages.create({
      model,
      max_tokens: 256,
      stream: true,
      messages: [
        {
          role: "user",
          content: "Explain Server-Sent Events in 40 words or less.",
        },
      ],
    });

    for await (const event of stream) {
      switch (event.type) {
        case "message_start":
          console.log(`[${event.type}] Message ID: ${event.message.id}, Role: ${event.message.role}`);
          console.log(`  Input tokens: ${event.message.usage.input_tokens}`);
          break;

        case "content_block_start":
          console.log(`[${event.type}] Block index: ${event.index}, Content type: ${event.content_block.type}`);
          break;

        case "content_block_delta":
          if (!firstTokenLogged) {
            const ttft = Date.now() - startTime;
            console.log(`  --> Time to First Token (TTFT): ${ttft}ms`);
            firstTokenLogged = true;
          }

          if (event.delta.type === "text_delta") {
            process.stdout.write(event.delta.text);
          } else if (event.delta.type === "input_json_delta") {
            console.log(`  [Partial JSON]: ${event.delta.partial_json}`);
          }
          break;

        case "content_block_stop":
          console.log(`\n[${event.type}] Finished content block index: ${event.index}`);
          break;

        case "message_delta":
          console.log(`[${event.type}] Stop reason: ${event.delta.stop_reason}`);
          console.log(`  Output tokens: ${event.usage.output_tokens}`);
          break;

        case "message_stop": {
          const totalDuration = Date.now() - startTime;
          console.log(`[${event.type}] Stream closed cleanly in ${totalDuration}ms.`);
          break;
        }

        case "ping":
          console.log(`[${event.type}] Ping frame received.`);
          break;

        default:
          break;
      }
    }
  } catch (err: unknown) {
    console.error("Error during raw stream processing:", err);
    throw err;
  }
}

/**
 * Demonstrates high-level createMessageStream helper with event emitter pattern.
 */
async function demonstrateStreamHelper(): Promise<void> {
  console.log("\n--- 2. High-Level Stream Helper (createMessageStream) ---");
  const startTime = Date.now();
  let firstTokenLogged = false;

  try {
    const stream = client.messages.stream({
      model,
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: "State three key production considerations when deploying SSE in production.",
        },
      ],
    });

    // Event listener for incoming text tokens
    stream.on("text", (deltaText: string) => {
      if (!firstTokenLogged) {
        const ttft = Date.now() - startTime;
        console.log(`[TTFT: ${ttft}ms] Text Stream:`);
        firstTokenLogged = true;
      }
      process.stdout.write(deltaText);
    });

    // Await stream completion and retrieve the fully accumulated message
    const finalMessage = await stream.finalMessage();
    console.log("\n");
    console.log("--- Final Message Summary ---");
    console.log(`Message ID:    ${finalMessage.id}`);
    console.log(`Stop Reason:   ${finalMessage.stop_reason}`);
    console.log(`Input Tokens:  ${finalMessage.usage.input_tokens}`);
    console.log(`Output Tokens: ${finalMessage.usage.output_tokens}`);
  } catch (err: unknown) {
    console.error("Error in stream helper execution:", err);
    throw err;
  }
}

async function main(): Promise<void> {
  console.log(`Starting Anthropic SSE Stream test with model: ${model}`);
  await demonstrateRawStream();
  await demonstrateStreamHelper();
}

main().catch((err) => {
  console.error("Fatal execution error:", err);
  process.exit(1);
});
