import Anthropic from "@anthropic-ai/sdk";
import * as dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("Error: ANTHROPIC_API_KEY environment variable is missing.");
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey });

async function probeModels(): Promise<boolean> {
  console.log("--- 1. Probing Models Endpoint ---");
  const start = performance.now();
  try {
    const list = await anthropic.models.list({ limit: 20 });
    const elapsedMs = performance.now() - start;
    console.log(`Status: OK (Retrieved models in ${elapsedMs.toFixed(2)} ms)`);
    console.log(`Total models returned: ${list.data.length}`);
    for (const model of list.data.slice(0, 5)) {
      console.log(`  - ${model.id}`);
    }
    return true;
  } catch (error: any) {
    if (error instanceof Anthropic.RateLimitError) {
      console.error(`Rate limited (HTTP 429): ${error.message}`);
    } else if (error instanceof Anthropic.InternalServerError) {
      console.error(`Anthropic Overloaded/Server Error (HTTP ${error.status}): ${error.message}`);
    } else if (error instanceof Anthropic.APIConnectionError) {
      console.error(`Connection failed: ${error.message}`);
    } else {
      console.error(`Unexpected API error: ${error.message}`);
    }
    return false;
  }
}

async function probeLatency(model = "claude-3-5-haiku-20241022"): Promise<boolean> {
  console.log(`\n--- 2. Measuring Latency Probe (${model}) ---`);
  const start = performance.now();
  try {
    const message = await anthropic.messages.create({
      model,
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    });
    const elapsedMs = performance.now() - start;
    console.log(`Status: OK (Roundtrip latency: ${elapsedMs.toFixed(2)} ms)`);
    console.log(`Model: ${message.model}`);
    console.log(`Tokens used: prompt=${message.usage.input_tokens}, completion=${message.usage.output_tokens}`);
    return true;
  } catch (error: any) {
    if (error instanceof Anthropic.RateLimitError) {
      console.error(`Rate limited (HTTP 429): ${error.message}`);
    } else if (error instanceof Anthropic.InternalServerError) {
      console.error(`Server error (HTTP ${error.status}): ${error.message}`);
    } else if (error instanceof Anthropic.APIConnectionError) {
      console.error(`Connection failed: ${error.message}`);
    } else {
      console.error(`Unexpected API error: ${error.message}`);
    }
    return false;
  }
}

async function main() {
  const modelsOk = await probeModels();
  const latencyOk = await probeLatency();
  if (modelsOk && latencyOk) {
    console.log("\nAll connectivity and model probes passed.");
    process.exit(0);
  } else {
    console.log("\nConnectivity probe encountered failures.");
    process.exit(1);
  }
}

main();
