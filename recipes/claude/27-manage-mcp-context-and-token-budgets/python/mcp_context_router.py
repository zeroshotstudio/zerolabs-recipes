#!/usr/bin/env python3
"""
Dynamic MCP Context Router and Tool Budget Optimizer.
Demonstrates:
1. Tool registry indexing across multiple simulated MCP servers.
2. Dynamic tool filtering based on intent classification / query token overlap.
3. Schema pruning (stripping verbose markdown examples, long descriptions, redundant fields).
4. Prompt caching injection (`cache_control: {"type": "ephemeral"}`).
5. Claude Messages API payload assembly and token evaluation.
"""

import copy
import json
import os
import re
from typing import Any, Dict, List, Optional, Tuple


class MCPToolContextRouter:
    """
    Manages MCP tool definitions, routing queries to relevant tools,
    pruning JSON schema bloat, and configuring Anthropic prompt caching breakpoints.
    """

    def __init__(
        self,
        max_tool_tokens: int = 4000,
        enable_caching: bool = True,
        enable_pruning: bool = True,
    ):
        self.max_tool_tokens = max_tool_tokens
        self.enable_caching = enable_caching
        self.enable_pruning = enable_pruning
        self.registry: Dict[str, Dict[str, Any]] = {}
        self.category_index: Dict[str, List[str]] = {}

    def register_server_tools(self, server_name: str, tools: List[Dict[str, Any]]) -> None:
        """Index raw tool specifications from an MCP server."""
        for tool in tools:
            name = tool["name"]
            # Store metadata alongside raw tool definition
            self.registry[name] = {
                "server": server_name,
                "tool": copy.deepcopy(tool),
                "category": tool.get("category", server_name),
                "tags": set(tool.get("tags", [])),
            }
            category = tool.get("category", server_name)
            if category not in self.category_index:
                self.category_index[category] = []
            self.category_index[category].append(name)

    @staticmethod
    def prune_schema(tool_def: Dict[str, Any], max_description_len: int = 120) -> Dict[str, Any]:
        """
        Prune verbose description strings, examples, and redundant validation
        metadata from JSON schema while preserving parameter names, types, and required fields.
        """
        pruned = copy.deepcopy(tool_def)

        # Truncate top-level tool description
        if "description" in pruned and isinstance(pruned["description"], str):
            desc = pruned["description"].strip()
            # If multi-line or long, take first sentence or slice
            first_sentence = desc.split("\n")[0]
            if len(first_sentence) > max_description_len:
                first_sentence = first_sentence[:max_description_len].rstrip() + "..."
            pruned["description"] = first_sentence

        # Clean input_schema properties
        input_schema = pruned.get("input_schema", {})
        properties = input_schema.get("properties", {})

        for prop_name, prop_spec in list(properties.items()):
            if not isinstance(prop_spec, dict):
                continue
            # Strip verbose descriptions in properties
            if "description" in prop_spec:
                prop_desc = prop_spec["description"].split("\n")[0]
                if len(prop_desc) > 80:
                    prop_desc = prop_desc[:80].rstrip() + "..."
                prop_spec["description"] = prop_desc

            # Strip non-essential keys that bloat context
            for key in ["examples", "example", "$comment", "title"]:
                prop_spec.pop(key, None)

        # Remove internal categorization tags before sending to Claude
        pruned.pop("category", None)
        pruned.pop("tags", None)
        return pruned

    def route_tools(
        self,
        query: str,
        active_tool_names: Optional[List[str]] = None,
        top_k: int = 8,
    ) -> List[Dict[str, Any]]:
        """
        Dynamically filter relevant tools from the registry using query keyword matching,
        category indexing, and explicit caller overrides.
        """
        if active_tool_names:
            selected_names = [n for n in active_tool_names if n in self.registry]
        else:
            # Tokenize query to compute keyword relevance scores
            query_tokens = set(re.findall(r"\w+", query.lower()))
            scored_tools: List[Tuple[float, str]] = []

            for name, meta in self.registry.items():
                tool = meta["tool"]
                score = 0.0

                # Score tool name matches
                name_tokens = set(re.findall(r"\w+", name.lower()))
                score += len(query_tokens & name_tokens) * 3.0

                # Score category and tag matches
                category_tokens = set(re.findall(r"\w+", meta["category"].lower()))
                score += len(query_tokens & category_tokens) * 2.0
                tag_tokens = {t.lower() for t in meta["tags"]}
                score += len(query_tokens & tag_tokens) * 1.5

                # Score description overlap
                desc = tool.get("description", "").lower()
                desc_tokens = set(re.findall(r"\w+", desc))
                score += len(query_tokens & desc_tokens) * 0.5

                if score > 0:
                    scored_tools.append((score, name))

            # Sort descending by relevance score
            scored_tools.sort(key=lambda x: x[0], reverse=True)
            selected_names = [name for _, name in scored_tools[:top_k]]

        # Always ensure at least default core tools if none matched
        if not selected_names:
            selected_names = list(self.registry.keys())[:top_k]

        # Extract tool definitions
        selected_tools = []
        for name in selected_names:
            raw_tool = self.registry[name]["tool"]
            if self.enable_pruning:
                selected_tools.append(self.prune_schema(raw_tool))
            else:
                clean_tool = copy.deepcopy(raw_tool)
                clean_tool.pop("category", None)
                clean_tool.pop("tags", None)
                selected_tools.append(clean_tool)

        return selected_tools

    def build_messages_payload(
        self,
        messages: List[Dict[str, Any]],
        system_instruction: str,
        query: str,
        active_tools: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Assemble the final Anthropic Messages API payload with dynamic tool filtering
        and cache breakpoints configured on the tools array.
        """
        routed_tools = self.route_tools(query, active_tool_names=active_tools)

        # Apply prompt caching breakpoint on the last tool definition
        if self.enable_caching and routed_tools:
            routed_tools[-1]["cache_control"] = {"type": "ephemeral"}

        # Format system block with cache control if prompt caching is active
        system_blocks = [
            {
                "type": "text",
                "text": system_instruction,
            }
        ]
        if self.enable_caching:
            system_blocks[-1]["cache_control"] = {"type": "ephemeral"}

        payload = {
            "model": os.environ.get("ANTHROPIC_MODEL", "claude-3-7-sonnet-20250219"),
            "max_tokens": 1024,
            "system": system_blocks,
            "messages": messages,
            "tools": routed_tools,
        }
        return payload


def generate_sample_mcp_cluster() -> Dict[str, List[Dict[str, Any]]]:
    """Generates sample tool schemas representing a 4-server enterprise MCP cluster."""
    return {
        "postgres_server": [
            {
                "name": "db_query_execute",
                "category": "database",
                "tags": ["sql", "postgres", "query", "select", "database"],
                "description": (
                    "Execute read-only SQL queries against the primary production PostgreSQL cluster.\n"
                    "Use this tool when users ask for analytics, customer records, database rows, or tabular metrics.\n"
                    "Example: SELECT id, name, email FROM customers WHERE status = 'active' LIMIT 10;"
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "sql": {
                            "type": "string",
                            "description": "Valid PostgreSQL query statement. Must be read-only SELECT or EXPLAIN.",
                            "examples": ["SELECT COUNT(*) FROM orders;"],
                        },
                        "timeout_ms": {
                            "type": "integer",
                            "description": "Timeout threshold in milliseconds before cancelling the database query cursor.",
                            "default": 5000,
                        },
                    },
                    "required": ["sql"],
                },
            },
            {
                "name": "db_table_schema_describe",
                "category": "database",
                "tags": ["sql", "postgres", "schema", "tables"],
                "description": "Inspect column names, data types, indexes, foreign keys, and constraints of a table.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "table_name": {
                            "type": "string",
                            "description": "Target database table name in the public schema.",
                        }
                    },
                    "required": ["table_name"],
                },
            },
        ],
        "github_server": [
            {
                "name": "github_pull_request_create",
                "category": "vcs",
                "tags": ["github", "git", "pr", "repo", "code"],
                "description": (
                    "Create a new pull request in a GitHub repository.\n"
                    "Provides branch diff integration, automated CI trigger verification, and reviewer assignment."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "repo": {"type": "string", "description": "Repository in owner/repo format."},
                        "head": {"type": "string", "description": "Working head branch containing changes."},
                        "base": {"type": "string", "description": "Target base branch, e.g. main or master."},
                        "title": {"type": "string", "description": "Concise pull request title."},
                        "body": {"type": "string", "description": "Markdown body describing code changes."},
                    },
                    "required": ["repo", "head", "base", "title"],
                },
            },
            {
                "name": "github_issue_search",
                "category": "vcs",
                "tags": ["github", "issues", "bugs", "search"],
                "description": "Search open and closed issues in a repository with keyword and label filters.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "repo": {"type": "string", "description": "Repository in owner/repo format."},
                        "query": {"type": "string", "description": "Search term matching titles or descriptions."},
                    },
                    "required": ["repo", "query"],
                },
            },
        ],
        "filesystem_server": [
            {
                "name": "file_read_text",
                "category": "filesystem",
                "tags": ["files", "read", "disk", "fs"],
                "description": "Read UTF-8 encoded text content from a local or containerized filesystem path.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "Absolute filesystem path to target file."}
                    },
                    "required": ["path"],
                },
            },
            {
                "name": "file_write_atomic",
                "category": "filesystem",
                "tags": ["files", "write", "disk", "save"],
                "description": "Atomically write or overwrite content to a file using temporary file swaps.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "Absolute target destination path."},
                        "content": {"type": "string", "description": "Full file string content."},
                    },
                    "required": ["path", "content"],
                },
            },
        ],
        "cloud_monitoring_server": [
            {
                "name": "metrics_query_range",
                "category": "monitoring",
                "tags": ["metrics", "prometheus", "cpu", "memory", "latency"],
                "description": "Query Prometheus or CloudWatch time-series metric vectors over a given time window.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "metric_name": {"type": "string", "description": "Name of the time-series metric."},
                        "start_time": {"type": "string", "description": "ISO 8601 start timestamp."},
                        "end_time": {"type": "string", "description": "ISO 8601 end timestamp."},
                    },
                    "required": ["metric_name", "start_time", "end_time"],
                },
            }
        ],
    }


def main():
    router = MCPToolContextRouter(enable_caching=True, enable_pruning=True)
    cluster = generate_sample_mcp_cluster()

    # Register all servers
    for srv, tools in cluster.items():
        router.register_server_tools(srv, tools)

    query = "Inspect customer order volume from the postgres database"
    messages = [{"role": "user", "content": query}]
    system_instruction = "You are an autonomous engineering agent with access to database and operations tools."

    payload = router.build_messages_payload(messages, system_instruction, query)
    print("=== MCP Context Router Payload Generated ===")
    print(f"Total Registered Tools: {len(router.registry)}")
    print(f"Routed Tools: {[t['name'] for t in payload['tools']]}")
    print(f"Prompt Caching Injected: {'cache_control' in payload['tools'][-1]}")
    print(f"Sample Pruned Tool:\n{json.dumps(payload['tools'][0], indent=2)}")


if __name__ == "__main__":
    main()
