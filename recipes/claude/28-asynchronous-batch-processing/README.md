# Anthropic Message Batches API

Complete implementation and automation scripts for running high-throughput asynchronous batch processing with Anthropic Claude models.

## Structure

- `python/`: Python SDK implementation (`anthropic.messages.batches`)
- `typescript/`: TypeScript implementation with streaming result iterator
- `curl_probe.sh`: Low-level bash / cURL diagnostic probe
- `blog-post.md`: Complete Diátaxis how-to guide

## Key Features

- **50% Token Cost Discount**: Half the price of synchronous calls on both input and output tokens.
- **Deterministic ID Tracking**: Every item is indexed by caller-defined `custom_id`.
- **Streamlined Status Transitions**: `in_progress` -> `canceling` -> `ended`.
- **Resilient Result Processing**: Item-level status handling for `succeeded`, `errored`, `canceled`, and `expired`.
