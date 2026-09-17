import { Anthropic } from "@anthropic-ai/sdk";
import * as dotenv from "dotenv";

dotenv.config();

// -----------------------------------------------------------------------------
// 1. TypeScript Interfaces for Type Safety
// -----------------------------------------------------------------------------
export interface OrderItem {
  sku: string;
  quantity: number;
  unit_price: number;
}

export interface CustomerOrder {
  order_id: string;
  customer_email: string;
  items: OrderItem[];
  fulfillment_priority: "standard" | "express" | "overnight";
  total_amount: number;
}

// -----------------------------------------------------------------------------
// 2. Strict JSON Schema Tool Definition
// -----------------------------------------------------------------------------
export const EXTRACTION_TOOL_NAME = "extract_customer_order";

export const customerOrderTool: Anthropic.Tool = {
  name: EXTRACTION_TOOL_NAME,
  description: "Extract fully validated customer order information conforming to strict database schema.",
  input_schema: {
    type: "object",
    properties: {
      order_id: {
        type: "string",
        description: "Unique identifier formatted as ORD-XXXXX.",
      },
      customer_email: {
        type: "string",
        description: "Validated customer email address.",
      },
      items: {
        type: "array",
        description: "List of purchased catalog items.",
        items: {
          type: "object",
          properties: {
            sku: {
              type: "string",
              description: "Product SKU code.",
            },
            quantity: {
              type: "integer",
              description: "Count of items purchased.",
            },
            unit_price: {
              type: "number",
              description: "Price per unit in USD.",
            },
          },
          required: ["sku", "quantity", "unit_price"],
          additionalProperties: false,
        },
      },
      fulfillment_priority: {
        type: "string",
        enum: ["standard", "express", "overnight"],
        description: "Shipping priority classification.",
      },
      total_amount: {
        type: "number",
        description: "Calculated total order amount.",
      },
    },
    required: ["order_id", "customer_email", "items", "fulfillment_priority", "total_amount"],
    additionalProperties: false,
  },
};

/**
 * Runtime validator asserting payload matches CustomerOrder structure
 */
function assertCustomerOrder(payload: unknown): asserts payload is CustomerOrder {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Invalid payload: root must be a non-null object.");
  }

  const p = payload as Record<string, unknown>;

  if (typeof p.order_id !== "string" || !p.order_id.startsWith("ORD-")) {
    throw new Error(`Invalid order_id: expected string starting with ORD-, got ${String(p.order_id)}`);
  }
  if (typeof p.customer_email !== "string" || !p.customer_email.includes("@")) {
    throw new Error(`Invalid customer_email: ${String(p.customer_email)}`);
  }
  if (!Array.isArray(p.items) || p.items.length === 0) {
    throw new Error("Invalid items: must be a non-empty array.");
  }
  for (const item of p.items as Record<string, unknown>[]) {
    if (typeof item.sku !== "string" || typeof item.quantity !== "number" || typeof item.unit_price !== "number") {
      throw new Error(`Invalid item structure in items list: ${JSON.stringify(item)}`);
    }
  }
  if (!["standard", "express", "overnight"].includes(p.fulfillment_priority as string)) {
    throw new Error(`Invalid fulfillment_priority: ${String(p.fulfillment_priority)}`);
  }
  if (typeof p.total_amount !== "number" || p.total_amount < 0) {
    throw new Error(`Invalid total_amount: ${String(p.total_amount)}`);
  }
}

/**
 * Executes a Messages API request enforcing tool invocation and returns typed order
 */
export async function extractCustomerOrder(unstructuredText: string): Promise<CustomerOrder> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is missing.");
  }

  const client = new Anthropic({ apiKey });

  console.log(`[*] Dispatching Messages API request with forced tool_choice: ${EXTRACTION_TOOL_NAME}...`);
  const response = await client.messages.create({
    model: "claude-3-7-sonnet-20250219",
    max_tokens: 1024,
    temperature: 0.0,
    tools: [customerOrderTool],
    tool_choice: {
      type: "tool",
      name: EXTRACTION_TOOL_NAME,
    },
    messages: [
      {
        role: "user",
        content: `Extract structured order data from this transaction:\n\n${unstructuredText}`,
      },
    ],
  });

  console.log(`[+] Response stop_reason: ${response.stop_reason}`);
  console.log(`[+] Token Usage -> Input: ${response.usage.input_tokens}, Output: ${response.usage.output_tokens}`);

  const toolUseBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === EXTRACTION_TOOL_NAME
  );

  if (!toolUseBlock) {
    throw new Error(
      `Expected tool_use block "${EXTRACTION_TOOL_NAME}" but none found. Stop reason: ${response.stop_reason}`
    );
  }

  console.log(`[+] Raw Tool Input:\n${JSON.stringify(toolUseBlock.input, null, 2)}`);

  assertCustomerOrder(toolUseBlock.input);
  return toolUseBlock.input;
}

async function run(): Promise<void> {
  const sampleInput =
    "Customer confirmation: Order ORD-99341 was placed by dev-ops@zeroshot.studio. " +
    "The customer bought 3 units of SKU-SRV-NVME at $249.99 each and 2 units of " +
    "SKU-RAM-64GB at $180.00 each. Expedited overnight delivery requested. " +
    "Total computed as $1109.97.";

  console.log("=".repeat(70));
  console.log("ZeroLabs Structured Output Enforcement Probe (TypeScript)");
  console.log("=".repeat(70));

  try {
    const order = await extractCustomerOrder(sampleInput);
    console.log("\n[SUCCESS] Successfully parsed and validated typed order:");
    console.log(`  Order ID:             ${order.order_id}`);
    console.log(`  Customer:             ${order.customer_email}`);
    console.log(`  Priority:             ${order.fulfillment_priority}`);
    console.log(`  Line Items Count:     ${order.items.length}`);
    order.items.forEach((item, idx) => {
      console.log(`    Item ${idx + 1}: SKU=${item.sku}, Qty=${item.quantity}, Price=$${item.unit_price.toFixed(2)}`);
    });
    console.log(`  Calculated Total:     $${order.total_amount.toFixed(2)}`);
  } catch (error) {
    console.error("[ERROR] Execution failed:", error);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== "test") {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
