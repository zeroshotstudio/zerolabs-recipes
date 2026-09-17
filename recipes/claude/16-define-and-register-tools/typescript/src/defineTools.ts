import Anthropic from "@anthropic-ai/sdk";

// Define typed tool definitions matching Claude's Tool schema
export const orderTools: Anthropic.Tool[] = [
  {
    name: "lookup_order",
    description: "Fetch shipping status, item line items, and fulfillment history for a customer order by ID.",
    input_schema: {
      type: "object",
      properties: {
        order_id: {
          type: "string",
          description: "The alphanumeric order identifier (e.g., ORD-94821)."
        },
        include_history: {
          type: "boolean",
          description: "Whether to return full timeline audit events."
        }
      },
      required: ["order_id"]
    }
  },
  {
    name: "cancel_order",
    description: "Trigger an order cancellation and initiate an automated refund workflow.",
    input_schema: {
      type: "object",
      properties: {
        order_id: {
          type: "string",
          description: "The unique order ID to cancel."
        },
        reason: {
          type: "string",
          enum: ["customer_request", "fraud_detected", "inventory_shortage", "duplicate_order"],
          description: "The categorized reason code for the cancellation."
        },
        notify_customer: {
          type: "boolean",
          description: "Whether to dispatch an email notification to the purchaser."
        }
      },
      required: ["order_id", "reason"]
    }
  }
];

export interface ParsedToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ParsedResponse {
  stopReason: Anthropic.Messages.StopReason | null;
  textBlocks: string[];
  toolCalls: ParsedToolCall[];
}

/**
 * Parses response blocks from a Claude Messages API completion.
 * Segregates raw text narratives from structured tool_use invocation payloads.
 */
export function parseResponseBlocks(response: Anthropic.Message): ParsedResponse {
  const result: ParsedResponse = {
    stopReason: response.stop_reason,
    textBlocks: [],
    toolCalls: []
  };

  for (const block of response.content) {
    if (block.type === "text") {
      result.textBlocks.push(block.text);
    } else if (block.type === "tool_use") {
      result.toolCalls.push({
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>
      });
    }
  }

  return result;
}

/**
 * Demonstrates registering tools and testing tool_choice strategies.
 */
export async function runToolDemonstration(client?: Anthropic): Promise<void> {
  const anthropic = client || new Anthropic();
  const model = process.env.ANTHROPIC_MODEL || "claude-3-7-sonnet-20250219";

  // Strategy 1: tool_choice = { type: "auto" }
  console.log("--- 1. Testing tool_choice: auto ---");
  const autoResponse = await anthropic.messages.create({
    model,
    max_tokens: 1024,
    tools: orderTools,
    tool_choice: { type: "auto" },
    messages: [
      { role: "user", content: "Can you check where order ORD-78210 is currently located?" }
    ]
  });

  const parsedAuto = parseResponseBlocks(autoResponse);
  console.log(`Stop Reason: ${parsedAuto.stopReason}`);
  for (const call of parsedAuto.toolCalls) {
    console.log(`  Tool Call: ${call.name} (id: ${call.id}) ->`, JSON.stringify(call.input));
  }

  // Strategy 2: tool_choice = { type: "tool", name: "cancel_order" }
  console.log("\n--- 2. Testing tool_choice: specific tool (cancel_order) ---");
  const forcedResponse = await anthropic.messages.create({
    model,
    max_tokens: 1024,
    tools: orderTools,
    tool_choice: { type: "tool", name: "cancel_order" },
    messages: [
      { role: "user", content: "Customer ORD-3312 wants a cancellation because of duplicate order placement." }
    ]
  });

  const parsedForced = parseResponseBlocks(forcedResponse);
  console.log(`Stop Reason: ${parsedForced.stopReason}`);
  for (const call of parsedForced.toolCalls) {
    console.log(`  Tool Call: ${call.name} (id: ${call.id}) ->`, JSON.stringify(call.input));
  }
}

if (require.main === module) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("ANTHROPIC_API_KEY environment variable is missing.");
  } else {
    runToolDemonstration().catch(console.error);
  }
}
