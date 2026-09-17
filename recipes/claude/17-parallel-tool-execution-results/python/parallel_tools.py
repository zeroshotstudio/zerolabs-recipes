"""
Concurrent Parallel Tool Execution and Result Dispatch with Anthropic Python SDK.
Demonstrates extracting multiple tool_use blocks, concurrent execution via asyncio.gather,
error isolation with is_error=True, and returning matching tool_result blocks.
"""

import asyncio
import json
import os
from typing import Any, Dict, List, Optional
from anthropic import AsyncAnthropic
from anthropic.types import Message, ToolUseBlock, ToolResultBlockParam


# 1. Define available tool schemas for Claude Messages API
TOOLS = [
    {
        "name": "fetch_stock_quote",
        "description": "Retrieve current price and volume metrics for a stock ticker symbol.",
        "input_schema": {
            "type": "object",
            "properties": {
                "symbol": {
                    "type": "string",
                    "description": "Stock ticker symbol, e.g. AAPL, MSFT, GOOGL"
                }
            },
            "required": ["symbol"]
        }
    },
    {
        "name": "fetch_weather",
        "description": "Get real-time weather conditions for a specified city.",
        "input_schema": {
            "type": "object",
            "properties": {
                "city": {
                    "type": "string",
                    "description": "City name, e.g. San Francisco, Tokyo, London"
                }
            },
            "required": ["city"]
        }
    }
]


# 2. Simulated tool worker implementations with mock data and latency
async def mock_fetch_stock_quote(symbol: str) -> Dict[str, Any]:
    """Simulate remote financial API call."""
    await asyncio.sleep(0.05)
    normalized = symbol.upper().strip()
    quotes = {
        "AAPL": {"symbol": "AAPL", "price": 224.23, "currency": "USD", "change": "+1.45%"},
        "MSFT": {"symbol": "MSFT", "price": 428.10, "currency": "USD", "change": "-0.32%"},
        "GOOGL": {"symbol": "GOOGL", "price": 178.35, "currency": "USD", "change": "+0.88%"}
    }
    if normalized not in quotes:
        raise ValueError(f"Ticker symbol '{symbol}' not found in registry.")
    return quotes[normalized]


async def mock_fetch_weather(city: str) -> Dict[str, Any]:
    """Simulate remote meteorological API call."""
    await asyncio.sleep(0.05)
    normalized = city.lower().strip()
    weather_db = {
        "san francisco": {"city": "San Francisco", "temp_c": 16.5, "condition": "Partly Cloudy", "humidity": "72%"},
        "tokyo": {"city": "Tokyo", "temp_c": 21.0, "condition": "Clear", "humidity": "55%"},
        "london": {"city": "London", "temp_c": 13.2, "condition": "Overcast", "humidity": "81%"}
    }
    if normalized not in weather_db:
        raise ValueError(f"City '{city}' not recognized in weather database.")
    return weather_db[normalized]


# 3. Dynamic dispatcher with error isolation
async def dispatch_single_tool(tool_use: ToolUseBlock) -> ToolResultBlockParam:
    """
    Execute a single tool call safely, isolating exceptions so the batch does not fail.
    Always returns a ToolResultBlockParam with matching tool_use_id.
    """
    tool_name = tool_use.name
    tool_input = tool_use.input
    tool_id = tool_use.id

    try:
        if tool_name == "fetch_stock_quote":
            symbol = tool_input.get("symbol", "")
            data = await mock_fetch_stock_quote(symbol)
            content = json.dumps(data)
            return {
                "type": "tool_result",
                "tool_use_id": tool_id,
                "content": content,
                "is_error": False
            }
        elif tool_name == "fetch_weather":
            city = tool_input.get("city", "")
            data = await mock_fetch_weather(city)
            content = json.dumps(data)
            return {
                "type": "tool_result",
                "tool_use_id": tool_id,
                "content": content,
                "is_error": False
            }
        else:
            return {
                "type": "tool_result",
                "tool_use_id": tool_id,
                "content": json.dumps({"error": f"Tool '{tool_name}' is not recognized."}),
                "is_error": True
            }
    except Exception as exc:
        return {
            "type": "tool_result",
            "tool_use_id": tool_id,
            "content": json.dumps({"error": str(exc), "tool": tool_name}),
            "is_error": True
        }


# 4. Orchestrator: parallel execution and multi-turn completion
async def execute_parallel_tools(
    client: AsyncAnthropic,
    prompt: str,
    model: str = "claude-3-7-sonnet-20250219"
) -> Message:
    """
    Send prompt to Claude, receive parallel tool_use blocks, execute them concurrently,
    and return the synthesized final assistant response.
    """
    messages: List[Dict[str, Any]] = [
        {"role": "user", "content": prompt}
    ]

    print(f"[Turn 1] Sending prompt: '{prompt}'")
    response_1: Message = await client.messages.create(
        model=model,
        max_tokens=1024,
        tools=TOOLS,
        messages=messages
    )

    # Inspect stop reason
    print(f"[Turn 1] Stop Reason: {response_1.stop_reason}")

    # Collect all tool_use blocks from the assistant's content
    tool_use_blocks = [
        block for block in response_1.content if block.type == "tool_use"
    ]
    print(f"[Turn 1] Extracted {len(tool_use_blocks)} tool_use block(s) from response.")

    if not tool_use_blocks:
        print("[Turn 1] No tool calls requested by Claude.")
        return response_1

    # Append the entire assistant response turn to message history
    messages.append({
        "role": "assistant",
        "content": response_1.content
    })

    # Execute all tool calls concurrently using asyncio.gather
    print(f"[Execution] Concurrently executing {len(tool_use_blocks)} tool call(s)...")
    tasks = [dispatch_single_tool(block) for block in tool_use_blocks]
    tool_results: List[ToolResultBlockParam] = await asyncio.gather(*tasks)

    for res in tool_results:
        status = "ERROR" if res.get("is_error") else "OK"
        print(f"  - ToolResult [{res['tool_use_id']}] Status: {status} | Content: {res['content']}")

    # Append all tool_result blocks in a single user turn
    messages.append({
        "role": "user",
        "content": tool_results
    })

    # Send final turn to Claude to synthesize parallel results
    print("[Turn 2] Sending tool_result blocks to Claude for final synthesis...")
    final_response: Message = await client.messages.create(
        model=model,
        max_tokens=1024,
        tools=TOOLS,
        messages=messages
    )

    print(f"[Turn 2] Final Response Stop Reason: {final_response.stop_reason}")
    return final_response


# 5. Local entry point and dry-run fallback
async def main() -> None:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ANTHROPIC_API_KEY environment variable not set.")
        print("Running mock local test verifying concurrent dispatcher...")
        # Simulate two tool use blocks
        fake_block_1 = ToolUseBlock(id="toolu_01_stock", name="fetch_stock_quote", input={"symbol": "AAPL"}, type="tool_use")
        fake_block_2 = ToolUseBlock(id="toolu_02_weather", name="fetch_weather", input={"city": "Tokyo"}, type="tool_use")
        fake_block_3 = ToolUseBlock(id="toolu_03_invalid", name="fetch_stock_quote", input={"symbol": "UNKNOWN"}, type="tool_use")

        results = await asyncio.gather(
            dispatch_single_tool(fake_block_1),
            dispatch_single_tool(fake_block_2),
            dispatch_single_tool(fake_block_3)
        )
        print("Mock execution results:")
        for r in results:
            print(f"  ID: {r['tool_use_id']} | is_error: {r['is_error']} | content: {r['content']}")
        return

    client = AsyncAnthropic(api_key=api_key)
    prompt = "Please look up the current stock price for AAPL and the weather in Tokyo and London simultaneously."
    final_message = await execute_parallel_tools(client, prompt)

    print("\n=== Final Claude Output ===")
    for block in final_message.content:
        if block.type == "text":
            print(block.text)


if __name__ == "__main__":
    asyncio.run(main())
