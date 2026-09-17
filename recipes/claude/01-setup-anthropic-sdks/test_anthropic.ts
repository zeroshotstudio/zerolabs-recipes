import dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";

dotenv.config();

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("FATAL: ANTHROPIC_API_KEY is missing from process.env");
  process.exit(1);
}

const anthropic = new Anthropic({
  apiKey: apiKey,
  maxRetries: 3,
  timeout: 10000,
});

async function runHealthCheck(): Promise<void> {
  try {
    const message = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 64,
      messages: [{ role: "user", content: "Respond with the word PING." }],
    });

    const firstBlock = message.content[0];
    if (firstBlock && firstBlock.type === "text") {
      console.log(`TypeScript SDK Verified: ${firstBlock.text.trim()} (Model: ${message.model})`);
    } else {
      console.warn("Received non-text response block from API.");
    }
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      console.error(`Anthropic API Error [${error.status}]: ${error.message}`);
    } else {
      console.error("Unexpected runtime failure:", error);
    }
    process.exit(1);
  }
}

runHealthCheck();
