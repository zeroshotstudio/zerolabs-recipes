"""
Anthropic Message Batches API Client.

Demonstrates submitting asynchronous batches with custom_id mapping,
monitoring batch lifecycle status, handling errors, streaming JSONL results,
and batch cancellation.
"""

import os
import sys
import time
from typing import Dict, Any, List, Optional
from anthropic import Anthropic
from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
from anthropic.types.messages.batch_create_params import Request


def init_client() -> Anthropic:
    """Initialize Anthropic client using environment variable."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY environment variable is missing.", file=sys.stderr)
        sys.exit(1)
    return Anthropic(api_key=api_key)


def build_batch_requests(prompts: List[Dict[str, str]], model: str = "claude-3-5-sonnet-20241022") -> List[Request]:
    """Construct individual batch requests tagged with deterministic custom_ids."""
    requests: List[Request] = []
    for item in prompts:
        req = Request(
            custom_id=item["id"],
            params=MessageCreateParamsNonStreaming(
                model=model,
                max_tokens=500,
                messages=[
                    {"role": "user", "content": item["prompt"]}
                ]
            )
        )
        requests.append(req)
    return requests


def submit_batch(client: Anthropic, requests: List[Request]):
    """Submit requests batch to the Anthropic Message Batches API endpoint."""
    print(f"[+] Submitting batch containing {len(requests)} requests...")
    batch = client.messages.batches.create(requests=requests)
    print(f"[+] Batch created successfully! ID: {batch.id}")
    print(f"    Processing status: {batch.processing_status}")
    print(f"    Created at: {batch.created_at}")
    return batch


def poll_batch_status(client: Anthropic, batch_id: str, poll_interval_seconds: int = 5, timeout_seconds: int = 300):
    """
    Poll batch status until it reaches 'ended' status or times out.
    Status transitions: in_progress -> canceling (if canceled) -> ended.
    """
    start_time = time.time()
    print(f"[+] Polling batch status for {batch_id} (interval: {poll_interval_seconds}s)...")
    
    while True:
        batch = client.messages.batches.retrieve(batch_id)
        counts = batch.request_counts
        print(
            f"    Status: {batch.processing_status} | "
            f"Processing: {counts.processing} | "
            f"Succeeded: {counts.succeeded} | "
            f"Errored: {counts.errored} | "
            f"Canceled: {counts.canceled} | "
            f"Expired: {counts.expired}"
        )

        if batch.processing_status == "ended":
            print(f"[+] Batch completed with final status 'ended' at {batch.ended_at}")
            return batch

        if time.time() - start_time > timeout_seconds:
            print(f"[!] Polling timed out after {timeout_seconds}s. Batch is still in progress.")
            return batch

        time.sleep(poll_interval_seconds)


def retrieve_and_parse_results(client: Anthropic, batch_id: str) -> Dict[str, Any]:
    """
    Stream and inspect JSONL results from completed batch.
    Maps custom_id to individual results (succeeded, errored, canceled, expired).
    """
    print(f"[+] Streaming batch results for {batch_id}...")
    results_map: Dict[str, Any] = {}
    
    for result in client.messages.batches.results(batch_id):
        cid = result.custom_id
        res_type = result.result.type

        if res_type == "succeeded":
            message = result.result.message
            text_blocks = [b.text for b in message.content if hasattr(b, "text")]
            content_text = "\n".join(text_blocks)
            usage = message.usage
            results_map[cid] = {
                "status": "succeeded",
                "content": content_text,
                "input_tokens": usage.input_tokens,
                "output_tokens": usage.output_tokens,
            }
            print(f"  [{cid}] SUCCEEDED ({usage.input_tokens} in / {usage.output_tokens} out tokens)")
        elif res_type == "errored":
            err = result.result.error
            results_map[cid] = {
                "status": "errored",
                "error": str(err)
            }
            print(f"  [{cid}] ERRORED: {err}")
        elif res_type == "canceled":
            results_map[cid] = {"status": "canceled"}
            print(f"  [{cid}] CANCELED")
        elif res_type == "expired":
            results_map[cid] = {"status": "expired"}
            print(f"  [{cid}] EXPIRED")

    return results_map


def cancel_batch(client: Anthropic, batch_id: str):
    """Cancel an active in-flight batch."""
    print(f"[!] Requesting cancellation for batch {batch_id}...")
    batch = client.messages.batches.cancel(batch_id)
    print(f"[!] Batch status updated to: {batch.processing_status}")
    return batch


def main():
    """Example workflow execution."""
    client = init_client()

    sample_tasks = [
        {"id": "doc-audit-001", "prompt": "Summarize the key benefits of batch processing APIs in 2 sentences."},
        {"id": "doc-audit-002", "prompt": "Extract 3 technical best practices for background async worker design."},
        {"id": "doc-audit-003", "prompt": "Explain why custom_id mapping is critical for idempotency in batch workloads."}
    ]

    requests = build_batch_requests(sample_tasks)
    batch = submit_batch(client, requests)
    final_batch = poll_batch_status(client, batch.id, poll_interval_seconds=3, timeout_seconds=60)

    if final_batch.processing_status == "ended":
        results = retrieve_and_parse_results(client, batch.id)
        print(f"\n[+] Total parsed items: {len(results)}")
    else:
        print(f"\n[*] Batch still processing or timed out. Check batch ID later: {batch.id}")


if __name__ == "__main__":
    main()
