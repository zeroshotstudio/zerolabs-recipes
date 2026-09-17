import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

// Zod schema for client-side tool argument validation
const LookupDatabaseRecordSchema = z.object({
  record_id: z.string().uuid({
    message: "Field 'record_id' must be a valid UUIDv4 string."
  }),
  environment: z.enum(["staging", "production"], {
    errorMap: () => ({ message: "Field 'environment' must be either 'staging' or 'production'." })
  })
});

type LookupDatabaseRecordArgs = z.infer<typeof LookupDatabaseRecordSchema>;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "lookup_database_record",
    description: "Look up a record in the database by valid UUID and environment.",
    input_schema: {
      type: "object",
      properties: {
        record_id: {
          type: "string",
          description: "Valid UUIDv4 format record identifier"
        },
        environment: {
          type: "string",
          enum: ["staging", "production"],
          description: "Deployment environment"
        }
      },
      required: ["record_id", "environment"]
    }
  }
];

const MOCK_DB: Record<string, { id: string; name: string; status: string; tier: string }> = {
  "550e8400-e29b-41d4-a716-446655440999": {
    id: "550e8400-e29b-41d4-a716-446655440999",
    name: "Acme Global Enterprise",
    status: "active",
    tier: "enterprise"
  }
};

class ToolExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolExecutionError";
  }
}

async function executeTool(name: string, input: unknown): Promise<string> {
  if (name !== "lookup_database_record") {
    throw new ToolExecutionError(`Unknown tool '${name}'. Permitted tools: lookup_database_record`);
  }

  // Validate tool input strictly with Zod
  const parseResult = LookupDatabaseRecordSchema.safeParse(input);
  if (!parseResult.success) {
    const formattedErrors = parseResult.error.issues
      .map(issue => `Path '${issue.path.join(".")}': ${issue.message}`)
      .join("; ");
    throw new ToolExecutionError(
      `ValidationError: Tool arguments failed schema check: ${formattedErrors}. ` +
      `Hint: If resolving legacy record 999, mapped UUID is '550e8400-e29b-41d4-a716-446655440999'.`
    );
  }

  const { record_id, environment } = parseResult.data;
  const record = MOCK_DB[record_id];
  if (!record) {
    throw new ToolExecutionError(`NotFoundError: Record with ID '${record_id}' does not exist in environment '${environment}'.`);
  }

  return JSON.stringify(record);
}

interface AgentResult {
  status: "success" | "circuit_breaker_tripped";
  output: string | null;
  turns: number;
  errors_recovered: number;
  messages: Anthropic.MessageParam[];
}

export async function runAgentLoop(
  client: Anthropic,
  initialPrompt: string,
  maxTurns: number = 4,
  model: string = "claude-3-7-sonnet-20250219"
): Promise<AgentResult> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: initialPrompt }
  ];

  let currentTurn = 0;
  let errorsRecovered = 0;

  while (currentTurn < maxTurns) {
    currentTurn++;
    console.log(`\n--- Turn ${currentTurn} ---`);

    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      tools: TOOLS,
      messages
    });

    // Record assistant turn in conversation context
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") {
      console.log("Claude completed task without further tool invocations.");
      const finalText = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map(b => b.text)
        .join("\n");

      return {
        status: "success",
        output: finalText,
        turns: currentTurn,
        errors_recovered: errorsRecovered,
        messages
      };
    }

    if (response.stop_reason === "tool_use") {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type === "tool_use") {
          const { id: toolUseId, name: toolName, input: toolInput } = block;
          console.log(`Tool call: ${toolName} (id: ${toolUseId}) | Args: ${JSON.stringify(toolInput)}`);

          try {
            const resultStr = await executeTool(toolName, toolInput);
            console.log(`Tool execution succeeded: ${resultStr}`);
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUseId,
              content: resultStr
            });
          } catch (err: unknown) {
            errorsRecovered++;
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.warn(`Tool execution failed: ${errorMessage}`);
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUseId,
              is_error: true,
              content: errorMessage
            });
          }
        }
      }

      // Append user turn containing tool results
      messages.push({ role: "user", content: toolResults });
    }
  }

  console.error(`Circuit breaker tripped after ${maxTurns} turns.`);
  return {
    status: "circuit_breaker_tripped",
    output: null,
    turns: currentTurn,
    errors_recovered: errorsRecovered,
    messages
  };
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Error: ANTHROPIC_API_KEY environment variable required.");
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });
  const prompt = "Query our production database for legacy record 999.";
  console.log(`Executing strict tool loop with prompt: "${prompt}"`);

  const result = await runAgentLoop(client, prompt);
  console.log("\n=== Final Loop Outcome ===");
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch(err => {
    console.error("Fatal agent error:", err);
    process.exit(1);
  });
}
