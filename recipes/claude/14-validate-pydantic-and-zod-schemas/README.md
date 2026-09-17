# Validate Pydantic and Zod Schemas with Claude

Production-ready test harnesses and implementation recipes demonstrating how to generate strict JSON Schema definitions from Pydantic models (Python) and Zod schemas (TypeScript), register them as tools in the Claude Messages API, enforce structured extraction via `tool_choice`, and deserialize model outputs into validated runtime instances.

Published as part of the ZeroLabs Claude Developer Curriculum: [How to Validate Pydantic and Zod Schemas with Claude](https://labs.zeroshot.studio/resources/how-to-validate-pydantic-and-zod-schemas-with-claude).

## Architectural Foundations

Connecting generative LLMs to production databases, internal message queues, and external APIs requires type safety and strict schema conformance. Rather than writing manual prompt engineering rules or maintaining duplicate JSON schemas, modern application architectures synthesize schemas directly from code:

1. **Schema Generation**: Domain models defined via Pydantic (`BaseModel`) or Zod (`z.object()`) compile automatically to standard JSON Schema specifications using `model_json_schema()` or `zod-to-json-schema`.
2. **Tool Definition**: The resulting JSON Schema is injected as the `input_schema` of an Anthropic tool definition.
3. **Constrained Generation**: Setting `tool_choice: {"type": "tool", "name": "<tool_name>"}` forces Claude to invoke the specific tool rather than writing unstructured text.
4. **Runtime Deserialization**: The returned tool parameters (`block.input`) are validated and parsed back into typed domain model instances (`IncidentReport.model_validate()` or `IncidentReportSchema.parse()`).
5. **Self-Correction Loop**: When validation errors occur, error tracebacks can be returned to Claude inside a `tool_result` block with `is_error: true` for automatic repair.

## Files

- `curl_probe.sh`: Executable bash probe registering tool JSON Schema and testing structured output generation via cURL and jq.
- `python/validate_pydantic.py`: Python client implementing Pydantic v2 schema compilation, tool extraction, and type-safe validation.
- `python/requirements.txt`: Python package dependencies (`anthropic`, `pydantic`, `python-dotenv`).
- `typescript/validate_zod.ts`: TypeScript client compiling Zod schemas via `zod-to-json-schema` and parsing tool responses.
- `typescript/package.json`: Node.js dependencies and run scripts.
- `metadata.json`: Content publication metadata and curriculum taxonomy tags.
- `.env.example`: Configuration template for Anthropic API keys.
- `blog-post.md`: Complete validated technical publication.

## Quick Start

### 1. Executable cURL Probe
```bash
export ANTHROPIC_API_KEY="sk-ant-api03-your-key-here"
chmod +x curl_probe.sh
./curl_probe.sh
```

### 2. Python Harness
```bash
cd python
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

python3 validate_pydantic.py
```

### 3. TypeScript Harness
```bash
cd typescript
npm install

npm start
```
