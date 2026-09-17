import Anthropic from "@anthropic-ai/sdk";

// 1. Define available tool schemas for Claude Messages API
export const TOOLS: Anthropic.Tool[] = [
  {
    name: "fetch_stock_quote",
    description: "Retrieve current price and volume metrics for a stock ticker symbol.",
    input_schema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Stock ticker symbol, e.g. AAPL, MSFT, GOOGL",
        },
      },
      required: ["symbol"],
    },
  },
  {
    name: "fetch_weather",
    description: "Get real-time weather conditions for a specified city.",
    input_schema: {
      type: "object",
      properties: {
        city: {
          type: "string",
          description: "City name, e.g. San Francisco, Tokyo, London",
        },
      },
      required: ["city"],
    },
  },
];

// 2. Simulated tool worker implementations
export async function mockFetchStockQuote(symbol: string): Promise<Record<string, unknown>> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  const quotes: Record<string, { symbol: string; price: number; currency: string; change: string }> = {
    AAPL: { symbol: "AAPL", price: 224.23, currency: "USD", change: "+1.45%" },
    MSFT: { symbol: "MSFT", price: 428.1, currency: "USD", change: "-0.32%" },
    GOOGL: { symbol: "GOOGL", price: 178.35, currency: "USD", change: "+0.88%" },
  };
  const normalized = symbol.toUpperCase().trim();
  if (!quotes[normalized]) {
    throw new Error(`Ticker symbol '${symbol}' not found in registry.`);
  }
  return quotes[normalized];
}

export async function mockFetchWeather(city: string): Promise<Record<string, unknown>> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  const weatherDb: Record<string, { city: string; temp_c: number; condition: string; humidity: string }> = {
    "san francisco": { city: "San Francisco", temp_c: 16.5, condition: "Partly Cloudy", humidity: "72%" },
    tokyo: { city: "Tokyo", temp_c: 21.0, condition: "Clear", humidity: "55%" },
    london: { city: "London", temp_c: 13.2, condition: "Overcast", humidity: "81%" },
  };
  const normalized = city.toLowerCase().trim();
  if (!weatherDb[normalized]) {
    throw new Error(`City '${city}' not recognized in weather database.`);
  }
  return weatherDb[normalized];
}

// 3. Isolated tool dispatcher
export async function dispatchSingleTool(
  toolUse: Anthropic.ToolUseBlock
): Promise<Anthropic.ToolResultBlockParam> {
  const toolId = toolUse.id;
  const toolName = toolUse.name;
  const input = toolUse.input as Record<string, unknown>;

  try {
    if (toolName === "fetch_stock_quote") {
      const symbol = String(input.symbol || "");
      const data = await mockFetchStockQuote(symbol);
      return {
        type: "tool_result",
        tool_use_id: toolId,
        content: JSON.stringify(data),
        is_error: false,
      };
    } else if (toolName === "fetch_weather") {
      const city = String(input.city || "");
      const data = await mockFetchWeather(city);
      return {
        type: "tool_result",
        tool_use_id: toolId,
        content: JSON.stringify(data),
        is_error: false,
      };
    } else {
      return {
        type: "tool_result",
        tool_use_id: toolId,
        content: JSON.stringify({ error: `Tool '${toolName}' is not recognized.` }),
        is_error: true,
      };
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      type: "tool_result",
      tool_use_id: toolId,
      content: JSON.stringify({ error: errorMessage, tool: toolName }),
      is_error: true,
    };
  }
}

// 4. Orchestrator: parallel execution and round-trip completion
export async function executeParallelTools(
  prompt: string,
  client?: Anthropic,
  model: string = "claude-3-7-sonnet-20250219"
): Promise<Anthropic.Message> {
  const anthropic = client || new Anthropic();
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: prompt },
  ];

  console.log(`[Turn 1] Querying Claude with prompt: '${prompt}'`);
  const response1 = await anthropic.messages.create({
    model,
    max_tokens: 1024,
    tools: TOOLS,
    messages,
  });

  console.log(`[Turn 1] Stop reason: ${response1.stop_reason}`);

  const toolUseBlocks = response1.content.filter(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  console.log(`[Turn 1] Extracted ${toolUseBlocks.length} tool_use block(s).`);

  if (toolUseBlocks.length === 0) {
    console.log("[Turn 1] No tool calls emitted.");
    return response1;
  }

  // Preserve assistant turn in history
  messages.push({
    role: "assistant",
    content: response1.content,
  });

  // Execute all tool calls concurrently with Promise.all
  console.log(`[Execution] Dispatching ${toolUseBlocks.length} tool calls concurrently via Promise.all...`);
  const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
    toolUseBlocks.map((block) => dispatchSingleTool(block))
  );

  for (const res of toolResults) {
    const status = res.is_error ? "ERROR" : "OK";
    console.log(`  - Result [${res.tool_use_id}] Status: ${status} | Payload: ${res.content}`);
  }

  // Return all matching tool_result blocks in the subsequent user turn
  messages.push({
    role: "user",
    content: toolResults,
  });

  console.log("[Turn 2] Sending tool_result blocks to Claude for final synthesis...");
  const finalResponse = await anthropic.messages.create({
    model,
    max_tokens: 1024,
    tools: TOOLS,
    messages,
  });

  console.log(`[Turn 2] Final stop reason: ${finalResponse.stop_reason}`);
  return finalResponse;
}

// 5. CLI runner
async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("ANTHROPIC_API_KEY is not set.");
    console.log("Dry-run test: verifying mock dispatch logic...");
    const sampleToolBlock: Anthropic.ToolUseBlock = {
      type: "tool_use",
      id: "toolu_mock_stock_99",
      name: "fetch_stock_quote",
      input: { symbol: "AAPL" },
    };
    const sampleErrorBlock: Anthropic.ToolUseBlock = {
      type: "tool_use",
      id: "toolu_mock_err_100",
      name: "fetch_stock_quote",
      input: { symbol: "UNKNOWN_TICKER" },
    };

    const results = await Promise.all([
      dispatchSingleTool(sampleToolBlock),
      dispatchSingleTool(sampleErrorBlock),
    ]);
    console.log("Dry-run results:", JSON.stringify(results, null, 2));
    return;
  }

  const prompt = "Please check the stock price of AAPL and the weather in London and Tokyo.";
  const finalMessage = await executeParallelTools(prompt);

  console.log("\n=== Final Claude Output ===");
  for (const block of finalMessage.content) {
    if (block.type === "text") {
      console.log(block.text);
    }
  }
}

if (process.argv[1]?.endsWith("parallelTools.ts") || process.argv[1]?.endsWith("parallelTools.js")) {
  main().catch(console.error);
}
