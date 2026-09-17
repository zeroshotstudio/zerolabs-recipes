import dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";

dotenv.config();

export function maskSecret(secret?: string): string {
  if (!secret || secret.length < 12) {
    return "[INVALID_KEY]";
  }
  return `${secret.slice(0, 7)}...${secret.slice(-4)}`;
}

export function loadAnthropicConfig(): { apiKey: string; fallbackKey?: string } {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const fallbackKey = process.env.ANTHROPIC_FALLBACK_API_KEY?.trim();

  if (!apiKey) {
    console.error("FATAL: ANTHROPIC_API_KEY is not defined in process.env");
    process.exit(1);
  }

  return { apiKey, fallbackKey };
}

export function createSecureAnthropicClient(): Anthropic {
  const { apiKey } = loadAnthropicConfig();
  console.log(`Initializing Anthropic client with key: ${maskSecret(apiKey)}`);

  return new Anthropic({
    apiKey,
    maxRetries: 3,
    timeout: 10000,
  });
}

const config = loadAnthropicConfig();
console.log("TypeScript Environment Key Verification:");
console.log(`  Primary Key:  ${maskSecret(config.apiKey)} (Length: ${config.apiKey.length})`);
if (config.fallbackKey) {
  console.log(`  Fallback Key: ${maskSecret(config.fallbackKey)} (Length: ${config.fallbackKey.length})`);
} else {
  console.log("  Fallback Key: Not configured (optional)");
}
console.log("Environment configuration passed.");
