"""
ZeroLabs Recipe: Validating Pydantic Schemas with Claude Tools
============================================================
Demonstrates:
1. Defining strongly-typed Pydantic models with validation constraints.
2. Converting Pydantic models to standard JSON Schema using model_json_schema().
3. Registering schemas with Anthropic Claude Messages API via tool definitions.
4. Enforcing structured output generation using tool_choice.
5. Extracting tool input blocks and parsing back into typed Pydantic instances.
6. Robust runtime handling for schema validation errors and recovery prompts.
"""

from __future__ import annotations

import json
import os
import sys
from enum import Enum
from typing import Any, List, Optional
from dotenv import load_dotenv
from pydantic import BaseModel, Field, ValidationError
import anthropic

load_dotenv()

API_KEY = os.getenv("ANTHROPIC_API_KEY")
if not API_KEY:
    print("Error: ANTHROPIC_API_KEY environment variable is missing.", file=sys.stderr)
    print("Set ANTHROPIC_API_KEY in your environment or .env file.", file=sys.stderr)
    sys.exit(1)

client = anthropic.Anthropic(api_key=API_KEY)


class SeverityLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class IncidentMetrics(BaseModel):
    error_rate: float = Field(
        ...,
        ge=0.0,
        le=100.0,
        description="Percentage error rate observed during the incident window (0.0 to 100.0).",
    )
    latency_p99_ms: float = Field(
        ...,
        ge=0.0,
        description="99th percentile request latency in milliseconds.",
    )


class IncidentReport(BaseModel):
    incident_id: str = Field(
        ...,
        pattern=r"^INC-[0-9]{4,6}$",
        description="Standardized incident identifier, e.g., 'INC-10492'.",
    )
    severity: SeverityLevel = Field(
        ...,
        description="Severity classification of the event.",
    )
    affected_services: List[str] = Field(
        ...,
        min_length=1,
        description="List of impacted microservices or components.",
    )
    summary: str = Field(
        ...,
        min_length=10,
        description="Executive summary of the incident root cause and operational impact.",
    )
    metrics: IncidentMetrics = Field(
        ...,
        description="Observed performance and error telemetry metrics.",
    )


def pydantic_model_to_tool_schema(model: type[BaseModel], tool_name: str, tool_description: str) -> dict[str, Any]:
    """
    Transforms a Pydantic v2 model into an Anthropic tool parameter dictionary.
    Cleans title metadata and sets additionalProperties to false for strict validation.
    """
    raw_schema = model.model_json_schema()
    
    # Clean top-level title to avoid redundant token overhead
    raw_schema.pop("title", None)
    
    return {
        "name": tool_name,
        "description": tool_description,
        "input_schema": raw_schema,
    }


def extract_and_validate_tool_call[T: BaseModel](
    response: anthropic.types.Message,
    tool_name: str,
    target_model: type[T],
) -> T:
    """
    Locates the tool_use content block in Claude's response and parses
    the dictionary payload directly into a validated Pydantic model instance.
    """
    tool_block = next(
        (block for block in response.content if block.type == "tool_use" and block.name == tool_name),
        None,
    )
    if not tool_block:
        raise ValueError(f"Expected tool call '{tool_name}' was not returned by Claude.")

    # In Anthropic Python SDK, block.input is already a deserialized dict
    raw_input: dict[str, Any] = tool_block.input
    validated_instance = target_model.model_validate(raw_input)
    return validated_instance


def main() -> None:
    print("======================================================================")
    print("ZeroLabs: Pydantic Schema Validation with Claude Messages API")
    print("======================================================================")

    tool_def = pydantic_model_to_tool_schema(
        IncidentReport,
        tool_name="record_incident_report",
        tool_description="Records a structured production incident report into the database.",
    )

    print(f"Generated JSON Schema for tool '{tool_def['name']}':")
    print(json.dumps(tool_def["input_schema"], indent=2))
    print()

    user_prompt = (
        "We experienced an outage on the payments-gateway and billing-processor services. "
        "The incident code is INC-84210. Root cause was an exhausted connection pool "
        "under high traffic. The error rate spiked to 18.5% and p99 latency reached 4120 ms. "
        "Severity is critical. Please document this incident."
    )

    print("Sending prompt to Claude 3.7 Sonnet with tool_choice constraint...")
    response = client.messages.create(
        model="claude-3-7-sonnet-20250219",
        max_tokens=1024,
        tools=[tool_def],
        tool_choice={"type": "tool", "name": "record_incident_report"},
        messages=[{"role": "user", "content": user_prompt}],
    )

    print(f"Stop Reason: {response.stop_reason}")
    print(f"Usage: Input tokens={response.usage.input_tokens}, Output tokens={response.usage.output_tokens}")
    print()

    try:
        validated_report = extract_and_validate_tool_call(
            response,
            tool_name="record_incident_report",
            target_model=IncidentReport,
        )
        print("Successfully deserialized into Pydantic model instance:")
        print(f"  Incident ID:       {validated_report.incident_id}")
        print(f"  Severity:          {validated_report.severity.value}")
        print(f"  Affected Services: {', '.join(validated_report.affected_services)}")
        print(f"  Summary:           {validated_report.summary}")
        print(f"  Metrics Error Rate:{validated_report.metrics.error_rate}%")
        print(f"  Metrics P99 Lat:   {validated_report.metrics.latency_p99_ms} ms")
        print()
        print("Type Verification:")
        print(f"  isinstance(validated_report, IncidentReport): {isinstance(validated_report, IncidentReport)}")
        print(f"  Model dump JSON: {validated_report.model_dump_json()}")
    except ValidationError as err:
        print(f"Validation Error caught: {err}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
