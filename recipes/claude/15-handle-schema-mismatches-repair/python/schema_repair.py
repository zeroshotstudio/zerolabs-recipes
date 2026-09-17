"""
Deterministic Schema Repair Loop with Pydantic and Anthropic Messages API.
Implements dynamic feedback turns and circuit breaker fallback to DLQ.
"""

import os
import json
from typing import List, Literal, Optional, Tuple
from pydantic import BaseModel, Field, ValidationError
from anthropic import Anthropic


class ServerDeployment(BaseModel):
    """Target schema for server deployment records."""
    service_name: str = Field(..., description="Unique alphanumeric identifier of the microservice")
    port: int = Field(..., ge=1, le=65535, description="Network port between 1 and 65535")
    status: Literal["healthy", "degraded", "stopped"] = Field(..., description="Current operational health status")
    tags: List[str] = Field(default_factory=list, description="Categorization tags")


def format_validation_errors(exc: ValidationError) -> str:
    """Format Pydantic validation errors into structured feedback for Claude."""
    error_lines = []
    for err in exc.errors():
        loc = ".".join(str(p) for p in err["loc"])
        msg = err["msg"]
        err_type = err["type"]
        error_lines.append(f"- Location: '{loc}' | Error Type: {err_type} | Details: {msg}")
    return "\n".join(error_lines)


def run_schema_repair_loop(
    prompt: str,
    max_retries: int = 3,
    client: Optional[Anthropic] = None
) -> Tuple[Optional[ServerDeployment], List[dict]]:
    """
    Executes a structured extraction loop with automated schema repair.
    
    If Claude returns invalid JSON or fails schema validation, the error is appended
    as a 'user' turn and sent back to Claude. If retries exceed max_retries, the
    circuit breaker trips and routes the payload to a Dead Letter Queue (DLQ).
    """
    if client is None:
        client = Anthropic()

    system_prompt = (
        "You are a strict data extraction engine. Output raw, valid JSON conforming to this schema:\n"
        "{\n"
        '  "service_name": "string",\n'
        '  "port": integer between 1 and 65535,\n'
        '  "status": "healthy" | "degraded" | "stopped",\n'
        '  "tags": ["string"]\n'
        "}\n"
        "Do not include markdown code fences, backticks, or explanatory commentary. Output JSON only."
    )

    messages = [
        {"role": "user", "content": prompt}
    ]

    for attempt in range(1, max_retries + 1):
        print(f"[Attempt {attempt}/{max_retries}] Requesting structured extraction from Claude...")
        
        response = client.messages.create(
            model="claude-3-7-sonnet-20250219",
            max_tokens=1024,
            system=system_prompt,
            messages=messages,
        )

        response_text = response.content[0].text.strip()
        
        # Append assistant turn to conversation history
        messages.append({"role": "assistant", "content": response_text})

        # 1. Parse JSON syntax
        try:
            parsed_json = json.loads(response_text)
        except json.JSONDecodeError as json_err:
            error_feedback = (
                f"JSON syntax parsing failed: {str(json_err)}.\n"
                f"Ensure the response is valid RFC 8259 JSON with no markdown ticks or conversational text."
            )
            print(f"  [JSON Error] {error_feedback}")
            messages.append({"role": "user", "content": error_feedback})
            continue

        # 2. Validate against Pydantic schema
        try:
            record = ServerDeployment.model_validate(parsed_json)
            print(f"  [Success] Record validated on attempt {attempt}: {record.service_name}")
            return record, messages
        except ValidationError as val_err:
            formatted_errors = format_validation_errors(val_err)
            error_feedback = (
                f"Schema validation failed with {len(val_err.errors())} error(s):\n"
                f"{formatted_errors}\n\n"
                f"Please fix these specific fields and return valid JSON adhering to the schema."
            )
            print(f"  [Schema Mismatch] Found {len(val_err.errors())} error(s)")
            messages.append({"role": "user", "content": error_feedback})

    # Circuit breaker tripped: route to Dead Letter Queue (DLQ)
    print(f"[Circuit Breaker] Max retries ({max_retries}) exceeded. Routing payload to Dead Letter Queue (DLQ).")
    dlq_record = {
        "status": "dlq_fallback",
        "prompt": prompt,
        "conversation_history": messages,
    }
    with open("dlq_events.jsonl", "a", encoding="utf-8") as dlq_file:
        dlq_file.write(json.dumps(dlq_record) + "\n")

    return None, messages


def main():
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ANTHROPIC_API_KEY environment variable is required to execute live inference.")
        print("Dry-run test: validating simulated repair cycle logic...")
        
        # Simulated test showing how error feedback is structured
        try:
            ServerDeployment.model_validate({"name": "api-gateway", "port": "not-an-int", "status": "unknown"})
        except ValidationError as e:
            feedback = format_validation_errors(e)
            print("Successfully verified Pydantic error formatter:")
            print(feedback)
            return

    client = Anthropic(api_key=api_key)
    test_prompt = "Provision service order-processing on port 8443, tags [commerce, checkout, pci], status running and healthy."
    record, history = run_schema_repair_loop(test_prompt, max_retries=3, client=client)
    
    if record:
        print(f"\nFinal Validated Record:\n{record.model_dump_json(indent=2)}")
    else:
        print("\nPipeline failed to converge. Checked DLQ store.")


if __name__ == "__main__":
    main()
