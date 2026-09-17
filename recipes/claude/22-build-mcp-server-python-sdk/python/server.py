"""
Production FastMCP Server with Custom Tools, Resources, and Prompts.

Protocol version: 2024-11-05
Demonstrates:
- FastMCP server lifecycle
- @mcp.tool() with Pydantic schema validation and Context injection
- @mcp.resource() with static and parameterized dynamic URI templates
- @mcp.prompt() reusable LLM interaction templates
- Standard I/O (stdio) transport execution
"""

import sys
import json
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from mcp.server.fastmcp import FastMCP, Context
import mcp.types as types

# Initialize FastMCP Server instance
mcp = FastMCP(
    name="production-python-mcp-server",
    dependencies=["pydantic", "httpx"]
)

# Simulated in-memory database
DEPLOYMENTS_DB: Dict[str, Dict[str, Any]] = {
    "prod-api-1": {
        "id": "prod-api-1",
        "service": "billing-api",
        "environment": "production",
        "status": "healthy",
        "replicas": 4,
        "region": "us-east-1",
        "version": "v2.14.0",
        "error_rate_pct": 0.02
    },
    "staging-auth-2": {
        "id": "staging-auth-2",
        "service": "auth-service",
        "environment": "staging",
        "status": "degraded",
        "replicas": 2,
        "region": "us-west-2",
        "version": "v2.15.1-rc1",
        "error_rate_pct": 4.18
    }
}

INCIDENT_PLAYBOOKS: Dict[str, str] = {
    "high-error-rate": "1. Verify canary deployment metrics.\n2. Roll back container image to previous stable digest.\n3. Flush Redis query cache.\n4. Alert on-call platform engineer.",
    "memory-leak": "1. Collect heap dump from worker container.\n2. Scale deployment horizontally to mitigate pressure.\n3. Cycle pod processes gracefully.\n4. Open priority investigation ticket."
}


# ==============================================================================
# 1. Pydantic Models for Schema Validation
# ==============================================================================

class DeploymentFilter(BaseModel):
    environment: Optional[str] = Field(
        default=None,
        description="Filter by environment name: 'production', 'staging', or 'development'"
    )
    status: Optional[str] = Field(
        default=None,
        description="Filter by status: 'healthy', 'degraded', or 'offline'"
    )


class RestartDeploymentRequest(BaseModel):
    deployment_id: str = Field(
        ...,
        description="Unique deployment identifier, e.g. 'prod-api-1'"
    )
    grace_period_seconds: int = Field(
        default=30,
        ge=5,
        le=300,
        description="Grace period in seconds for container teardown (5-300)"
    )
    reason: str = Field(
        ...,
        min_length=5,
        max_length=200,
        description="Audit reason for triggering deployment restart"
    )


# ==============================================================================
# 2. MCP Tools
# ==============================================================================

@mcp.tool()
async def query_deployments(filter_criteria: DeploymentFilter, ctx: Context) -> str:
    """Query infrastructure deployment records with structured filters.
    
    Inspects active microservice deployments and returns operational health status.
    """
    await ctx.info(f"Filtering deployments with criteria: {filter_criteria.model_dump()}")
    
    results = []
    for dep in DEPLOYMENTS_DB.values():
        if filter_criteria.environment and dep["environment"] != filter_criteria.environment:
            continue
        if filter_criteria.status and dep["status"] != filter_criteria.status:
            continue
        results.append(dep)
        
    return json.dumps({
        "total_matched": len(results),
        "deployments": results
    }, indent=2)


@mcp.tool()
async def restart_service(request: RestartDeploymentRequest, ctx: Context) -> str:
    """Trigger graceful restart for a target service deployment.
    
    Validates deployment existence, emits operational logs via Context, and updates state.
    """
    await ctx.info(f"Received restart request for deployment '{request.deployment_id}'")
    
    if request.deployment_id not in DEPLOYMENTS_DB:
        await ctx.error(f"Deployment '{request.deployment_id}' not found in cluster registry")
        raise ValueError(f"Deployment '{request.deployment_id}' not found.")
        
    dep = DEPLOYMENTS_DB[request.deployment_id]
    dep["status"] = "healthy"
    dep["error_rate_pct"] = 0.00
    
    await ctx.info(f"Deployment '{request.deployment_id}' restarted. Reason: {request.reason}")
    
    return json.dumps({
        "status": "success",
        "action": "graceful_restart",
        "deployment_id": request.deployment_id,
        "grace_period_seconds": request.grace_period_seconds,
        "reason": request.reason,
        "current_state": dep
    }, indent=2)


# ==============================================================================
# 3. MCP Resources (Static & Dynamic)
# ==============================================================================

@mcp.resource("cluster://topology/overview")
def get_cluster_overview() -> str:
    """Read-only topology overview of all managed cluster nodes and services."""
    return json.dumps({
        "cluster_name": "us-east-core-production",
        "kubernetes_version": "1.31.2",
        "total_nodes": 12,
        "managed_deployments": list(DEPLOYMENTS_DB.keys())
    }, indent=2)


@mcp.resource("playbook://incident/{incident_type}")
def get_incident_playbook(incident_type: str) -> str:
    """Retrieve procedural remediation steps for specific incident classes."""
    if incident_type not in INCIDENT_PLAYBOOKS:
        return f"Unknown incident type: '{incident_type}'. Available: {list(INCIDENT_PLAYBOOKS.keys())}"
    return INCIDENT_PLAYBOOKS[incident_type]


# ==============================================================================
# 4. MCP Prompts
# ==============================================================================

@mcp.prompt()
def triage_service_alert(service_name: str, error_snippet: str) -> str:
    """Generate structured prompt instructions for triaging production alerts."""
    return (
        f"You are a Site Reliability Engineer triaging an alert on service '{service_name}'.\n\n"
        f"Alert Log Output:\n"
        f"```\n{error_snippet}\n```\n\n"
        f"Instructions:\n"
        f"1. Query deployments using 'query_deployments' to check current operational health.\n"
        f"2. Inspect the relevant incident playbook via 'playbook://incident/high-error-rate'.\n"
        f"3. Recommend remediation actions or trigger 'restart_service' if safe."
    )


# ==============================================================================
# 5. Server Entry Point
# ==============================================================================

if __name__ == "__main__":
    # Run server with standard input/output transport
    mcp.run(transport="stdio")
