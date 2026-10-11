# Recipe 21: Computer Use Protocol Simulator and Sandbox Design Notes

The Python and TypeScript examples demonstrate Computer Use tool registration
and a bounded tool-result loop. **They are protocol simulators.** They provision
no desktop or container, send no mouse/keyboard input, and return a transparent
**1×1 placeholder PNG**, independent of their nominal 1024×768 tool dimensions.

Every simulated action result includes `simulated: true`. The live loop prints a
warning and tells the model that the desktop is simulated. Its keyword filter
only demonstrates a rejected tool result: it supplies no filesystem or network
isolation, protection against prompt injection, or human approval workflow.

Live mode still sends real requests to Anthropic and may incur API usage charges.
This example cannot prove that a GUI task completed. The historical default model
and beta schema have not been revalidated against a live account; select a
currently supported model/tool combination before making requests.

## What is implemented

- Registration of `computer_20250124` with nominal display dimensions.
- In-memory cursor movement, click/type/key acknowledgements and cursor queries.
- A transparent placeholder image in screenshot `tool_result` blocks.
- A toy keyword rejection and a maximum of five API turns by default.

Unsupported actions return `unsupported_action`. Turn limits bound API rounds;
they do not impose an operating-system resource boundary or an action deadline.

## Offline checks

Python simulator tests need only the standard library:

```sh
python3 -m unittest discover -s recipes/claude/21-provision-sandbox-computer-use/python -p 'test_*.py'
```

TypeScript checks use the locked dependencies and Node 22 or later:

```sh
cd recipes/claude/21-provision-sandbox-computer-use/typescript
npm ci
npm run build
node --experimental-strip-types computer_use_orchestrator.ts --offline-smoke
```

Neither offline command calls Anthropic or interacts with a desktop.

## Optional live protocol demonstration

Install the Anthropic Python SDK for the Python loop, or install the locked
TypeScript dependencies as above. Set the key in the process environment:

```sh
export ANTHROPIC_API_KEY="your-anthropic-api-key"
# Optional: export MODEL="a-model-compatible-with-computer_20250124"
python3 recipes/claude/21-provision-sandbox-computer-use/python/computer_use_orchestrator.py
```

For TypeScript, run `node --experimental-strip-types computer_use_orchestrator.ts`
from its directory. The `.env.example` file documents variables; the programs do
not load `.env` automatically. The nominal display environment variables are
used only by `curl_probe.sh`; the orchestrators use fixed nominal dimensions.

`curl_probe.sh` sends a real initial API request. It verifies request/response
compatibility only; it provisions no desktop, captures no actual screen, and
does not establish deployment readiness.

## Designing an actual desktop runtime

[The accompanying design notes](blog-post.md) retain illustrative Xvfb/Fluxbox
Docker and entrypoint snippets. They are unvalidated guidance, not shipped
infrastructure or a hardened sandbox. They are not connected to these simulators.

An actual deployment needs a separately implemented desktop driver, verified
isolation and network policy, credential separation, resource limits, and an
approval mechanism appropriate to its actions. A container running as a non-root
user alone does not establish these guarantees. A keyword filter cannot identify
all destructive GUI actions or enforce human consent.
