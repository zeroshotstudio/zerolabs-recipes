"""
Automated Client Test for FastMCP Python Server over Stdio.

Validates:
- Stdio handshake and protocol initialization
- Tool listing, schema inspection, and execution
- Resource discovery and reading (static + URI template)
- Prompt discovery and retrieval
"""

import sys
import os
import asyncio
import json
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def run_client_probe():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    server_script = os.path.join(current_dir, "server.py")
    python_bin = sys.executable

    print(f"[*] Starting MCP Stdio Server: {python_bin} {server_script}")

    server_params = StdioServerParameters(
        command=python_bin,
        args=[server_script],
        env=os.environ.copy()
    )

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            # 1. Initialize session
            print("[*] Initializing MCP Session...")
            init_result = await session.initialize()
            print(f"[+] Connected to server: {init_result.serverInfo.name} (Protocol version: {init_result.protocolVersion})")

            # 2. List tools
            print("\n--- 1. Testing Tools ---")
            tools_response = await session.list_tools()
            tool_names = [t.name for t in tools_response.tools]
            print(f"[+] Registered tools ({len(tool_names)}): {tool_names}")
            assert "query_deployments" in tool_names, "query_deployments tool missing"
            assert "restart_service" in tool_names, "restart_service tool missing"

            # Execute tool: query_deployments
            print("[*] Invoking 'query_deployments' tool (filter: environment='production')...")
            tool_call_res = await session.call_tool(
                "query_deployments",
                {"filter_criteria": {"environment": "production"}}
            )
            raw_text = tool_call_res.content[0].text
            res_data = json.loads(raw_text)
            print(f"[+] Result: Matched {res_data['total_matched']} deployment(s).")
            assert res_data["total_matched"] == 1
            assert res_data["deployments"][0]["id"] == "prod-api-1"

            # Execute tool: restart_service
            print("[*] Invoking 'restart_service' tool for 'staging-auth-2'...")
            restart_call_res = await session.call_tool(
                "restart_service",
                {
                    "request": {
                        "deployment_id": "staging-auth-2",
                        "grace_period_seconds": 15,
                        "reason": "Automated remediation of degraded health status"
                    }
                }
            )
            restart_data = json.loads(restart_call_res.content[0].text)
            print(f"[+] Restart result status: {restart_data['status']}, new state: {restart_data['current_state']['status']}")
            assert restart_data["status"] == "success"
            assert restart_data["current_state"]["status"] == "healthy"

            # 3. List & Read Resources
            print("\n--- 2. Testing Resources ---")
            resources_response = await session.list_resources()
            resource_uris = [str(r.uri) for r in resources_response.resources]
            print(f"[+] Discovered static resources: {resource_uris}")

            # Read static resource
            print("[*] Reading 'cluster://topology/overview'...")
            cluster_res = await session.read_resource("cluster://topology/overview")
            cluster_text = cluster_res.contents[0].text
            print(f"[+] Content:\n{cluster_text}")
            assert "us-east-core-production" in cluster_text

            # Read dynamic resource template
            print("[*] Reading dynamic URI template 'playbook://incident/high-error-rate'...")
            playbook_res = await session.read_resource("playbook://incident/high-error-rate")
            playbook_text = playbook_res.contents[0].text
            print(f"[+] Playbook snippet:\n{playbook_text.splitlines()[0]}")
            assert "Roll back" in playbook_text

            # 4. List & Get Prompts
            print("\n--- 3. Testing Prompts ---")
            prompts_response = await session.list_prompts()
            prompt_names = [p.name for p in prompts_response.prompts]
            print(f"[+] Discovered prompts: {prompt_names}")
            assert "triage_service_alert" in prompt_names

            print("[*] Retrieving prompt 'triage_service_alert'...")
            prompt_res = await session.get_prompt(
                "triage_service_alert",
                {"service_name": "billing-api", "error_snippet": "500 Internal Server Error in /checkout"}
            )
            prompt_content = prompt_res.messages[0].content.text
            print(f"[+] Prompt message text preview:\n{prompt_content[:140]}...")
            assert "billing-api" in prompt_content

    print("\n[SUCCESS] All FastMCP client probe tests passed cleanly!")


if __name__ == "__main__":
    asyncio.run(run_client_probe())
