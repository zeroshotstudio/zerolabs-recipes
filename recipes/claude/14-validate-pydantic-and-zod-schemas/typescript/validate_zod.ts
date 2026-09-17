/**
 * ZeroLabs Recipe: Validating Zod Schemas with Claude Tools
 * ========================================================
 * Demonstrates:
 * 1. Defining strongly-typed runtime validation schemas using Zod.
 * 2. Converting Zod schemas to clean JSON Schema using zod-to-json-schema.
 * 3. Registering schemas with the Anthropic Messages API.
 * 4. Enforcing deterministic tool calling with tool_choice.
 * 5. Extracting and parsing tool_use input blocks back into typed TypeScript interfaces.
 * 6. Handling validation errors and retries.
 */

import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

dotenv.config();

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("Error: ANTHROPIC_API_KEY environment variable is missing.");
  console.error("Set ANTHROPIC_API_KEY in your environment or .env file.");
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey });

// 1. Define Zod Schemas
export const IncidentMetricsSchema = z.object({
  error_rate: z
    .number()
    .min(0.0)
    .max(100.0)
    .describe("Percentage error rate observed during the incident window (0.0 to 100.0)."),
  latency_p99_ms: z
    .number()
    .nonnegative()
    .describe("99th percentile request latency in milliseconds."),
});

export const IncidentReportSchema = z.object({
  incident_id: z
    .string()
    .regex(/^INC-[0-9]{4,6}$/, "Identifier must follow pattern INC-XXXX")
    .describe("Standardized incident identifier, e.g., 'INC-10492'."),
  severity: z
    .enum(["low", "medium", "high", "critical"])
    .describe("Severity classification of the event."),
  affected_services: z
    .array(z.string())
    .min(1)
    .describe("List of impacted microservices or components."),
  summary: z
    .string()
    .min(10)
    .describe("Executive summary of the incident root cause and operational impact."),
  metrics: IncidentMetricsSchema.describe("Observed performance and error telemetry metrics."),
});

export type IncidentReport = z.infer<typeof IncidentReportSchema>;

/**
 * Converts a Zod schema into an Anthropic Tool definition.
 * Strips $schema references and definitions wrappers for direct compatibility.
 */
export function zodToAnthropicTool<T extends z.ZodTypeAny>(
  schema: T,
  name: string,
  description: string
): Anthropic.Tool {
  const jsonSchema = zodToJsonSchema(schema, {
    name,
    target: "jsonSchema7",
    $refStrategy: "none",
  });

  // Extract the root object schema if wrapped in definitions
  const rawInputSchema =
    (jsonSchema as { definitions?: Record<string, unknown> }).definitions?.[name] || jsonSchema;

  // Remove top-level $schema metadata to avoid extra tokens
  const cleanSchema = { ...rawInputSchema } as Record<string, unknown>;
  delete cleanSchema.$schema;
  delete cleanSchema.definitions;

  return {
    name,
    description,
    input_schema: cleanSchema as Anthropic.Tool.InputSchema,
  };
}

/**
 * Parses Claude tool call input using Zod and returns typed data.
 */
export function parseToolCall<T extends z.ZodTypeAny>(
  response: Anthropic.Message,
  toolName: string,
  schema: T
): z.infer<T> {
  const toolUseBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock =>
      block.type === "tool_use" && block.name === toolName
  );

  if (!toolUseBlock) {
    throw new Error(`Expected tool_use block for '${toolName}' not found in Claude response.`);
  }

  // Parse and validate with Zod
  const parsed = schema.safeParse(toolUseBlock.input);
  if (!parsed.success) {
    throw new Error(`Zod validation failed: ${JSON.stringify(parsed.error.format(), null, 2)}`);
  }

  return parsed.data;
}

async function main() {
  console.log("======================================================================");
  console.log("ZeroLabs: Zod Schema Validation with Claude Messages API");
  console.log("======================================================================");

  const toolDefinition = zodToAnthropicTool(
    IncidentReportSchema,
    "record_incident_report",
    "Records a structured production incident report into the database."
  );

  console.log(`Generated Tool Definition (${toolDefinition.name}):`);
  console.log(JSON.stringify(toolDefinition.input_schema, null, 2));
  console.log();

  const userPrompt =
    "Outage report: services impacted include user-auth and session-redis. " +
    "Ticket ID is INC-30194. Severity marked as high. Latency p99 degraded to 1890 ms " +
    "with an error rate of 8.4 percent. Summary: Redis replica desynchronization caused auth token verification failures.";

  console.log("Dispatching message to Claude 3.7 Sonnet with enforced tool_choice...");
  const message = await anthropic.messages.create({
    model: "claude-3-7-sonnet-20250219",
    max_tokens: 1024,
    tools: [toolDefinition],
    tool_choice: { type: "tool", name: "record_incident_report" },
    messages: [{ role: "user", content: userPrompt }],
  });

  console.log(`Stop Reason: ${message.stop_reason}`);
  console.log(`Usage: Input=${message.usage.input_tokens}, Output=${message.usage.output_tokens}`);
  console.log();

  try {
    const validatedReport: IncidentReport = parseToolCall(
      message,
      "record_incident_report",
      IncidentReportSchema
    );

    console.log("Successfully validated and deserialized into TypeScript object:");
    console.log(`  Incident ID:       ${validatedReport.incident_id}`);
    console.log(`  Severity:          ${validatedReport.severity}`);
    console.log(`  Affected Services: ${validatedReport.affected_services.join(", ")}`);
    console.log(`  Summary:           ${validatedReport.summary}`);
    console.log(`  Metrics Error Rate:${validatedReport.metrics.error_rate}%`);
    console.log(`  Metrics P99 Lat:   ${validatedReport.metrics.latency_p99_ms} ms`);
    console.log();
    console.log("Verified Object Output:");
    console.log(JSON.stringify(validatedReport, null, 2));
  } catch (error) {
    console.error("Extraction or validation failed:", error);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unhandled execution error:", err);
  process.exit(1);
});
