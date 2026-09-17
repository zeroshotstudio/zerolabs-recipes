import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import * as fs from "node:fs";

// 1. Define Zod target schema
export const ServerDeploymentSchema = z.object({
  service_name: z.string().min(1, "service_name cannot be empty"),
  port: z.number().int().min(1).max(65535),
  status: z.enum(["healthy", "degraded", "stopped"]),
  tags: z.array(z.string()).default([]),
});

export type ServerDeployment = z.infer<typeof ServerDeploymentSchema>;

// 2. Format Zod errors into dynamic feedback for Claude
export function formatZodIssues(issues: z.ZodIssue[]): string {
  return issues
    .map((issue) => {
      const path = issue.path.join(".") || "root";
      return `- Field '${path}': [${issue.code}] ${issue.message}`;
    })
    .join("\n");
}

// 3. Multi-turn schema repair loop with circuit breaker
export async function runSchemaRepairLoop(
  prompt: string,
  maxRetries: number = 3,
  client?: Anthropic
): Promise<{ record: ServerDeployment | null; messages: Anthropic.MessageParam[] }> {
  const anthropic = client || new Anthropic();
  const systemPrompt = `You are a strict data extraction engine. Output raw, valid JSON conforming to this schema:
{
  "service_name": "string",
  "port": integer between 1 and 65535,
  "status": "healthy" | "degraded" | "stopped",
  "tags": ["string"]
}
Do not include markdown code fences, backticks, or explanatory commentary. Output JSON only.`;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: prompt },
  ];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`[Attempt ${attempt}/${maxRetries}] Requesting structured extraction from Claude...`);

    const response = await anthropic.messages.create({
      model: "claude-3-7-sonnet-20250219",
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const responseBlock = response.content[0];
    if (responseBlock.type !== "text") {
      throw new Error(`Unexpected block type: ${responseBlock.type}`);
    }

    const responseText = responseBlock.text.trim();
    messages.push({ role: "assistant", content: responseText });

    // Step A: Parse raw JSON syntax
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(responseText);
    } catch (syntaxError: any) {
      const errorFeedback = `JSON syntax parsing failed: ${syntaxError.message}.\nEnsure the response is valid RFC 8259 JSON without code fences or surrounding text.`;
      console.log(`  [JSON Syntax Error] ${syntaxError.message}`);
      messages.push({ role: "user", content: errorFeedback });
      continue;
    }

    // Step B: Validate with Zod
    const validationResult = ServerDeploymentSchema.safeParse(parsedJson);
    if (validationResult.success) {
      console.log(`  [Success] Record validated on attempt ${attempt}: ${validationResult.data.service_name}`);
      return { record: validationResult.data, messages };
    }

    // Format errors and append correction feedback
    const formattedErrors = formatZodIssues(validationResult.error.issues);
    const feedback = `Schema validation failed with ${validationResult.error.issues.length} error(s):\n${formattedErrors}\n\nPlease fix these specific fields and return valid JSON adhering to the schema.`;
    console.log(`  [Schema Mismatch] Found ${validationResult.error.issues.length} issue(s)`);
    messages.push({ role: "user", content: feedback });
  }

  // Circuit breaker tripped: route to Dead Letter Queue (DLQ)
  console.log(`[Circuit Breaker] Max retries (${maxRetries}) reached without schema convergence. Routing to DLQ.`);
  const dlqEntry = {
    status: "dlq_fallback",
    timestamp: new Date().toISOString(),
    prompt,
    messages,
  };
  fs.appendFileSync("dlq_events.jsonl", JSON.stringify(dlqEntry) + "\n", "utf8");

  return { record: null, messages };
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("ANTHROPIC_API_KEY environment variable is not set.");
    console.log("Dry-run test: verifying simulated Zod issue formatter...");
    const sampleInvalid = { name: "db-replica", port: "5432", status: "invalid_status" };
    const check = ServerDeploymentSchema.safeParse(sampleInvalid);
    if (!check.success) {
      console.log("Formatted feedback sample:\n" + formatZodIssues(check.error.issues));
    }
    return;
  }

  const testPrompt = "Deploy service redis-cache on port 6379 with status healthy and tags [cache, in-memory, key-value].";
  const { record } = await runSchemaRepairLoop(testPrompt, 3);
  if (record) {
    console.log("\nFinal Validated Record:\n" + JSON.stringify(record, null, 2));
  } else {
    console.log("\nPipeline fell back to DLQ.");
  }
}

if (process.argv[1]?.endsWith("schemaRepair.ts") || process.argv[1]?.endsWith("schemaRepair.js")) {
  main().catch(console.error);
}
