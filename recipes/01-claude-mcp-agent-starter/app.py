#!/usr/bin/env python3
"""
Autonomous MCP Agent Harness
ZeroLabs Recipe #01: Production MCP Agent Starter
=================================================
A minimal, production-tested harness connecting Anthropic Claude
to Model Context Protocol (MCP) tool endpoints with automatic tool calling,
loop guards, token budgeting, and SQLite state persistence.
"""

import os
import sys
import json
import sqlite3
import logging
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, field

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("zerolabs-mcp-agent")

# --- Configuration & Guardrail Constants ---
MAX_TURNS_PER_SESSION = int(os.environ.get("MAX_AGENT_TURNS", "10"))
MAX_TOKEN_BUDGET = int(os.environ.get("MAX_TOKEN_BUDGET", "50000"))
DEFAULT_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022")


@dataclass
class TokenTracker:
    input_tokens: int = 0
    output_tokens: int = 0
    turn_count: int = 0

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens

    def record(self, in_tokens: int, out_tokens: int):
        self.input_tokens += in_tokens
        self.output_tokens += out_tokens
        self.turn_count += 1
        logger.info(
            f"Turn {self.turn_count}: +{in_tokens} in / +{out_tokens} out "
            f"(Session Total: {self.total_tokens} tokens)"
        )


class StateStore:
    """Local SQLite-backed session persistence."""
    def __init__(self, db_path: str = "agent_state.db"):
        self.conn = sqlite3.connect(db_path)
        self._init_db()

    def _init_db(self):
        with self.conn:
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS session_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    role TEXT,
                    content TEXT,
                    tool_calls TEXT
                )
            """)

    def log_event(self, role: str, content: str, tool_calls: Optional[List[Dict[str, Any]]] = None):
        with self.conn:
            self.conn.execute(
                "INSERT INTO session_logs (role, content, tool_calls) VALUES (?, ?, ?)",
                (role, content, json.dumps(tool_calls or []))
            )


class McpToolRegistry:
    """
    Registry that discovers, validates, and routes calls to Model Context Protocol tools.
    Supports built-in fallback mock tools for headless CI/CD testing.
    """
    def __init__(self):
        self._tools: Dict[str, Dict[str, Any]] = {}
        self._register_default_tools()

    def _register_default_tools(self):
        self.register_tool(
            name="read_file",
            description="Safely inspect text file contents within project boundary.",
            input_schema={
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Relative file path"}
                },
                "required": ["path"]
            },
            handler=self._handle_read_file
        )
        self.register_tool(
            name="calculate_token_cost",
            description="Estimate API token pricing across Claude and OpenAI frontier models.",
            input_schema={
                "type": "object",
                "properties": {
                    "input_tokens": {"type": "integer"},
                    "output_tokens": {"type": "integer"},
                    "model": {"type": "string", "enum": ["claude-3-5-sonnet", "gpt-4o"]}
                },
                "required": ["input_tokens", "output_tokens"]
            },
            handler=self._handle_token_calc
        )

    def register_tool(self, name: str, description: str, input_schema: Dict[str, Any], handler: Any):
        self._tools[name] = {
            "name": name,
            "description": description,
            "input_schema": input_schema,
            "handler": handler
        }

    def get_tool_definitions(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": t["name"],
                "description": t["description"],
                "input_schema": t["input_schema"]
            }
            for t in self._tools.values()
        ]

    def execute_tool(self, name: str, args: Dict[str, Any]) -> str:
        if name not in self._tools:
            raise ValueError(f"Unknown MCP tool: {name}")
        handler = self._tools[name]["handler"]
        return handler(args)

    def _handle_read_file(self, args: Dict[str, Any]) -> str:
        path = args.get("path", "")
        # Prevent directory traversal
        if ".." in path or path.startswith("/"):
            return json.dumps({"error": "Access denied: Absolute paths and directory traversal forbidden."})
        if not os.path.exists(path):
            return json.dumps({"error": f"File not found: {path}"})
        try:
            with open(path, "r", encoding="utf-8") as f:
                return f.read()[:2000]
        except Exception as e:
            return json.dumps({"error": str(e)})

    def _handle_token_calc(self, args: Dict[str, Any]) -> str:
        inp = args.get("input_tokens", 0)
        out = args.get("output_tokens", 0)
        cost = (inp * 0.000003) + (out * 0.000015)
        return json.dumps({
            "input_tokens": inp,
            "output_tokens": out,
            "estimated_cost_usd": round(cost, 5),
            "currency": "USD"
        })


class AutonomousMcpAgent:
    """Production Agent Runner with execution bounds and token guardrails."""
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        self.registry = McpToolRegistry()
        self.state_store = StateStore()
        self.tracker = TokenTracker()

    def run(self, prompt: str) -> Dict[str, Any]:
        logger.info(f"Starting agent run for prompt: {prompt[:80]}...")
        self.state_store.log_event("user", prompt)

        if not self.api_key or self.api_key == "mock-key":
            logger.warning("No live ANTHROPIC_API_KEY detected. Executing in deterministic mock test harness mode.")
            return self._run_mock(prompt)

        try:
            import anthropic
            client = anthropic.Anthropic(api_key=self.api_key)

            messages = [{"role": "user", "content": prompt}]

            while self.tracker.turn_count < MAX_TURNS_PER_SESSION:
                if self.tracker.total_tokens >= MAX_TOKEN_BUDGET:
                    logger.error("Token budget exceeded safety threshold. Terminating loop.")
                    break

                response = client.messages.create(
                    model=DEFAULT_MODEL,
                    max_tokens=1024,
                    tools=self.registry.get_tool_definitions(),
                    messages=messages
                )

                self.tracker.record(
                    response.usage.input_tokens,
                    response.usage.output_tokens
                )

                tool_calls = [c for c in response.content if c.type == "tool_use"]
                text_content = " ".join([c.text for c in response.content if c.type == "text"])

                self.state_store.log_event("assistant", text_content, [
                    {"name": c.name, "input": c.input} for c in tool_calls
                ])

                if not tool_calls:
                    logger.info("Agent completed execution successfully.")
                    return {
                        "status": "completed",
                        "response": text_content,
                        "turns": self.tracker.turn_count,
                        "tokens": self.tracker.total_tokens
                    }

                # Process Tool Calls
                tool_results = []
                for tc in tool_calls:
                    logger.info(f"Executing tool '{tc.name}' with args {tc.input}")
                    try:
                        res = self.registry.execute_tool(tc.name, tc.input)
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": tc.id,
                            "content": str(res)
                        })
                    except Exception as e:
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": tc.id,
                            "content": json.dumps({"error": str(e)}),
                            "is_error": True
                        })

                messages.append({"role": "assistant", "content": response.content})
                messages.append({"role": "user", "content": tool_results})

            return {
                "status": "turn_limit_reached",
                "turns": self.tracker.turn_count,
                "tokens": self.tracker.total_tokens
            }

        except ImportError:
            logger.warning("Anthropic SDK not installed. Falling back to mock test execution.")
            return self._run_mock(prompt)

    def _run_mock(self, prompt: str) -> Dict[str, Any]:
        """Deterministic fallback test execution."""
        tool_defs = self.registry.get_tool_definitions()
        # Mocking an inspection tool call
        result = self.registry.execute_tool("calculate_token_cost", {
            "input_tokens": 1500,
            "output_tokens": 400
        })
        self.tracker.record(1500, 400)
        self.state_store.log_event("assistant", "Mock tool executed successfully.", [{"tool": "calculate_token_cost"}])
        return {
            "status": "completed_mock",
            "available_tools": [t["name"] for t in tool_defs],
            "mock_tool_output": json.loads(result),
            "turns": self.tracker.turn_count,
            "tokens": self.tracker.total_tokens
        }


def main():
    agent = AutonomousMcpAgent()
    res = agent.run("Evaluate MCP tool pricing and inspect local configuration.")
    print("\n--- Agent Execution Summary ---")
    print(json.dumps(res, indent=2))


if __name__ == "__main__":
    main()
