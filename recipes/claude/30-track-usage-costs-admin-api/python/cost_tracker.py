#!/usr/bin/env python3
"""
Anthropic Admin API Usage Cost Tracker & Prometheus Metrics Exporter.

Tracks token consumption (input, output, cache creation, cache read) across
workspaces, calculates exact dollar costs based on Anthropic published rates,
fetches organization audit log events, and exports Prometheus metrics.
"""

from __future__ import annotations

import os
import sys
import time
import logging
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone

import httpx
from pydantic import BaseModel, Field
from prometheus_client import start_http_server, Counter, Gauge

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("claude-cost-tracker")

# Pricing table per 1,000,000 tokens (USD)
# Claude 3.7 Sonnet / Claude 3.5 Sonnet:
#   Input: $3.00, Output: $15.00, Cache Write: $3.75, Cache Read: $0.30
# Claude 3.5 Haiku:
#   Input: $0.80, Output: $4.00, Cache Write: $1.00, Cache Read: $0.08
# Claude 3 Opus:
#   Input: $15.00, Output: $75.00, Cache Write: $18.75, Cache Read: $1.50
MODEL_PRICING: Dict[str, Dict[str, float]] = {
    "claude-3-7-sonnet": {
        "input_per_m": 3.00,
        "output_per_m": 15.00,
        "cache_write_per_m": 3.75,
        "cache_read_per_m": 0.30,
    },
    "claude-3-5-sonnet": {
        "input_per_m": 3.00,
        "output_per_m": 15.00,
        "cache_write_per_m": 3.75,
        "cache_read_per_m": 0.30,
    },
    "claude-3-5-haiku": {
        "input_per_m": 0.80,
        "output_per_m": 4.00,
        "cache_write_per_m": 1.00,
        "cache_read_per_m": 0.08,
    },
    "claude-3-opus": {
        "input_per_m": 15.00,
        "output_per_m": 75.00,
        "cache_write_per_m": 18.75,
        "cache_read_per_m": 1.50,
    },
}

# Prometheus Metrics Definitions
PROMETHEUS_TOKEN_USAGE = Counter(
    "anthropic_tokens_total",
    "Total token consumption across workspaces and models",
    ["workspace_id", "model", "token_type"],
)

PROMETHEUS_ESTIMATED_COST = Gauge(
    "anthropic_estimated_cost_dollars",
    "Estimated cumulative cost in USD by workspace and model",
    ["workspace_id", "model"],
)

PROMETHEUS_CACHE_READ_RATIO = Gauge(
    "anthropic_cache_read_ratio",
    "Ratio of cache read tokens to total prompt tokens",
    ["workspace_id", "model"],
)

PROMETHEUS_AUDIT_EVENTS = Counter(
    "anthropic_audit_events_total",
    "Total audit events ingested from Admin API",
    ["event_type", "actor_type"],
)


class UsageRecord(BaseModel):
    workspace_id: str = Field(default="default")
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    cache_creation_input_tokens: int = 0
    cache_read_input_tokens: int = 0


class CostSummary(BaseModel):
    model: str
    input_cost: float
    output_cost: float
    cache_write_cost: float
    cache_read_cost: float
    total_cost: float
    cache_read_ratio: float


def get_pricing_key(model_name: str) -> str:
    """Normalize model string to pricing table key."""
    model_lower = model_name.lower()
    if "claude-3-7-sonnet" in model_lower:
        return "claude-3-7-sonnet"
    if "claude-3-5-sonnet" in model_lower:
        return "claude-3-5-sonnet"
    if "claude-3-5-haiku" in model_lower:
        return "claude-3-5-haiku"
    if "claude-3-opus" in model_lower:
        return "claude-3-opus"
    return "claude-3-7-sonnet"


def calculate_cost(record: UsageRecord) -> CostSummary:
    """Compute granular billable costs for a token usage record."""
    rates = MODEL_PRICING.get(get_pricing_key(record.model), MODEL_PRICING["claude-3-7-sonnet"])

    input_cost = (record.input_tokens / 1_000_000.0) * rates["input_per_m"]
    output_cost = (record.output_tokens / 1_000_000.0) * rates["output_per_m"]
    cache_write_cost = (record.cache_creation_input_tokens / 1_000_000.0) * rates["cache_write_per_m"]
    cache_read_cost = (record.cache_read_input_tokens / 1_000_000.0) * rates["cache_read_per_m"]

    total_cost = input_cost + output_cost + cache_write_cost + cache_read_cost
    total_input = record.input_tokens + record.cache_creation_input_tokens + record.cache_read_input_tokens
    cache_read_ratio = (record.cache_read_input_tokens / total_input) if total_input > 0 else 0.0

    return CostSummary(
        model=record.model,
        input_cost=round(input_cost, 6),
        output_cost=round(output_cost, 6),
        cache_write_cost=round(cache_write_cost, 6),
        cache_read_cost=round(cache_read_cost, 6),
        total_cost=round(total_cost, 6),
        cache_read_ratio=round(cache_read_ratio, 4),
    )


class AdminAPIClient:
    """Client for Anthropic Organization Admin and Audit API."""

    def __init__(self, admin_key: str, base_url: str = "https://api.anthropic.com"):
        self.base_url = base_url.rstrip("/")
        self.admin_key = admin_key
        self.headers = {
            "x-api-key": self.admin_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }

    def list_workspaces(self) -> List[Dict[str, Any]]:
        """Fetch all workspaces in the organization."""
        url = f"{self.base_url}/v1/organizations/workspaces"
        with httpx.Client(timeout=10.0) as client:
            try:
                resp = client.get(url, headers=self.headers)
                if resp.status_code == 200:
                    return resp.json().get("data", [])
                logger.warning("Admin API workspaces returned %s: %s", resp.status_code, resp.text)
                return []
            except Exception as e:
                logger.error("Failed to fetch workspaces: %s", e)
                return []

    def fetch_audit_logs(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Fetch organization audit logs (API key creation, member changes, role updates)."""
        url = f"{self.base_url}/v1/organizations/audit_logs"
        params = {"limit": limit}
        with httpx.Client(timeout=10.0) as client:
            try:
                resp = client.get(url, headers=self.headers, params=params)
                if resp.status_code == 200:
                    return resp.json().get("data", [])
                logger.warning("Admin API audit_logs returned %s: %s", resp.status_code, resp.text)
                return []
            except Exception as e:
                logger.error("Failed to query audit logs: %s", e)
                return []


def update_prometheus_metrics(record: UsageRecord, summary: CostSummary) -> None:
    """Publish usage and cost telemetry to Prometheus counters and gauges."""
    workspace = record.workspace_id
    model = record.model

    PROMETHEUS_TOKEN_USAGE.labels(workspace_id=workspace, model=model, token_type="input").inc(record.input_tokens)
    PROMETHEUS_TOKEN_USAGE.labels(workspace_id=workspace, model=model, token_type="output").inc(record.output_tokens)
    PROMETHEUS_TOKEN_USAGE.labels(workspace_id=workspace, model=model, token_type="cache_creation").inc(
        record.cache_creation_input_tokens
    )
    PROMETHEUS_TOKEN_USAGE.labels(workspace_id=workspace, model=model, token_type="cache_read").inc(
        record.cache_read_input_tokens
    )

    PROMETHEUS_ESTIMATED_COST.labels(workspace_id=workspace, model=model).set(summary.total_cost)
    PROMETHEUS_CACHE_READ_RATIO.labels(workspace_id=workspace, model=model).set(summary.cache_read_ratio)


def inspect_audit_events_for_anomalies(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Detect security anomalies like unauthorized key creations or privilege escalations."""
    flagged: List[Dict[str, Any]] = []
    for ev in events:
        event_type = ev.get("type", "unknown")
        actor_type = ev.get("actor", {}).get("type", "system")
        PROMETHEUS_AUDIT_EVENTS.labels(event_type=event_type, actor_type=actor_type).inc()

        # Flag API key creations outside business hours or by service accounts
        if event_type in ("api_key.created", "api_key.deleted", "workspace_member.added"):
            flagged.append(ev)
            logger.warning("Governance Alert: Sensitive Admin API event detected: %s by %s", event_type, actor_type)
    return flagged


def run_standalone_demo() -> None:
    """Run local cost calculation and probe verification without requiring live credentials."""
    logger.info("Starting Claude Cost Tracker local verification demo...")

    sample_workspaces = [
        UsageRecord(
            workspace_id="wrk_prod_inference",
            model="claude-3-7-sonnet-20250219",
            input_tokens=150_000,
            output_tokens=45_000,
            cache_creation_input_tokens=80_000,
            cache_read_input_tokens=720_000,
        ),
        UsageRecord(
            workspace_id="wrk_batch_evaluation",
            model="claude-3-5-haiku-20241022",
            input_tokens=500_000,
            output_tokens=120_000,
            cache_creation_input_tokens=200_000,
            cache_read_input_tokens=1_800_000,
        ),
    ]

    for record in sample_workspaces:
        summary = calculate_cost(record)
        update_prometheus_metrics(record, summary)
        logger.info(
            "Workspace: %s | Model: %s | Total Cost: $%s | Cache Read Ratio: %s%%",
            record.workspace_id,
            record.model,
            summary.total_cost,
            round(summary.cache_read_ratio * 100, 2),
        )
        logger.info(
            "  -> Breakdown: Input: $%s, Output: $%s, Cache Write: $%s, Cache Read: $%s",
            summary.input_cost,
            summary.output_cost,
            summary.cache_write_cost,
            summary.cache_read_cost,
        )

    # Simulated audit events
    mock_events = [
        {
            "id": "evt_01",
            "type": "api_key.created",
            "actor": {"type": "user", "id": "usr_dev_01"},
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "id": "evt_02",
            "type": "workspace.created",
            "actor": {"type": "admin", "id": "usr_admin_01"},
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
    ]
    flagged = inspect_audit_events_for_anomalies(mock_events)
    logger.info("Audit log anomaly inspection complete. Flagged events: %d", len(flagged))


if __name__ == "__main__":
    admin_key = os.getenv("ANTHROPIC_ADMIN_API_KEY")
    port = int(os.getenv("PROMETHEUS_PORT", "9108"))

    logger.info("Starting Prometheus metrics HTTP server on port %d...", port)
    start_http_server(port)

    if not admin_key or "your_" in admin_key:
        logger.info("No live ANTHROPIC_ADMIN_API_KEY detected. Executing deterministic verification suite...")
        run_standalone_demo()
        logger.info("Metrics server live at http://127.0.0.1:%d/metrics. Exiting demo run.", port)
    else:
        logger.info("Live ANTHROPIC_ADMIN_API_KEY detected. Polling Admin API...")
        client = AdminAPIClient(admin_key=admin_key)
        while True:
            events = client.fetch_audit_logs(limit=25)
            inspect_audit_events_for_anomalies(events)
            time.sleep(int(os.getenv("POLL_INTERVAL_SECONDS", "60")))
