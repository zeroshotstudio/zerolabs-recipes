import Anthropic from '@anthropic-ai/sdk';
import type { Message, Tool } from '@anthropic-ai/sdk/resources/messages';

// Synthetic technical corpus exceeding 1,024 token minimum for Sonnet/Opus
const SAMPLE_TECHNICAL_SPEC = `
ZERO-SHOT STUDIO DISTRIBUTED AGENT RUNTIME SPECIFICATION (VERSION 4.2)
======================================================================
1. SYSTEM TOPOLOGY AND INTER-PROCESS COMMUNICATION
The ZeroLabs agent orchestrator deploys supervisor nodes and worker pools
across isolated runtime containers. Supervisor processes supervise execution
lifecycles, route task dispatches via Unix domain sockets, and monitor worker
heartbeats at 500-millisecond intervals.

When a worker process experiences an unrecoverable exception or memory limit
violation, the supervisor traps the termination signal, snapshots execution
registers, isolates corrupt state vectors, and respawns a clean worker within
75 milliseconds. Inter-agent messages are serialized into binary flatbuffers
and cryptographically signed using ephemeral session tokens.

2. PROMPT CACHING ARCHITECTURE AND PREFIX COMPACTION
Frontier language model requests incur substantial token processing overhead
when multi-turn conversations accumulate large document schemas, tool manifests,
and contextual memories. Anthropic prompt caching eliminates redundant compute
by storing the key-value (KV) activations of the prompt prefix in accelerator
memory across a rolling 5-minute time-to-live (TTL) window.

To achieve maximum cache utilization:
a. Static system instructions must be positioned at the start of the request.
b. Reusable tool declarations must be placed immediately following system text.
c. Stable document context or retrieval-augmented generation (RAG) knowledge
   chunks must precede dynamic conversation turns.
d. Dynamic user inputs, transient memory recalls, and run-specific variables
   must remain strictly after the final cache breakpoint.

3. BREAKPOINT LIMITS AND TOKEN THRESHOLDS
The Messages API supports up to four explicit cache breakpoints per request
using the cache_control: {"type": "ephemeral"} block attribute.
For Claude 3.5 Sonnet and Claude 3 Opus, the minimum cacheable prefix length
is 1,024 tokens. For Claude 3.5 Haiku, the minimum threshold is 2,048 tokens.
Requests specifying breakpoints on prefixes smaller than these model thresholds
execute normally without caching, returning zero cache_creation_input_tokens.

4. CACHE INVALIDATION AND DETERMINISTIC HASHING
The caching engine constructs prefix hashes hierarchically. A cache breakpoint
at index K is valid only if all content preceding index K remains identical
in character composition, ordering, and block structure. Any modification to
an early system prompt block invalidates all downstream breakpoints within that
request hierarchy.
`.repeat(3); // Multiplied to exceed 1,500 tokens

const SAMPLE_TOOLS: Tool[] = [
  {
    name: 'lookup_cluster_health',
    description: 'Retrieve health metrics, pod counts, and saturation scores for an agent cluster.',
    input_schema: {
      type: 'object',
      properties: {
        cluster_id: {
          type: 'string',
          description: 'The unique cluster identifier (e.g., prod-us-east-1).',
        },
        metric_window_seconds: {
          type: 'integer',
          description: 'Rolling evaluation window in seconds.',
          default: 300,
        },
      },
      required: ['cluster_id'],
    },
  },
  {
    name: 'restart_worker_node',
    description: 'Trigger a graceful restart of an unresponsive agent worker container.',
    input_schema: {
      type: 'object',
      properties: {
        node_id: {
          type: 'string',
          description: 'The identifier of the node to restart.',
        },
        drain_timeout_seconds: {
          type: 'integer',
          description: 'Time allocated for draining in-flight requests before SIGKILL.',
          default: 30,
        },
      },
      required: ['node_id'],
    },
    // Breakpoint caches all tools declared up to this point
    cache_control: { type: 'ephemeral' },
  },
];

function inspectCacheMetrics(turnLabel: string, message: Message): void {
  const usage = message.usage as typeof message.usage & {
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  };

  const uncached = usage.input_tokens;
  const created = usage.cache_creation_input_tokens ?? 0;
  const read = usage.cache_read_input_tokens ?? 0;
  const output = usage.output_tokens;

  console.log(`\n[${turnLabel}] Message ID: ${message.id}`);
  console.log(`  Uncached Input Tokens: ${uncached}`);
  console.log(`  Cache Creation Tokens: ${created}`);
  console.log(`  Cache Read Tokens:     ${read}`);
  console.log(`  Output Tokens:         ${output}`);

  const totalInput = uncached + created + read;
  if (totalInput > 0) {
    const ratio = ((read / totalInput) * 100).toFixed(1);
    console.log(`  Cache Efficiency Ratio: ${ratio}%`);
  }

  if (created > 0) {
    console.log('  Status: Cache breakpoint created and stored in KV memory.');
  } else if (read > 0) {
    console.log('  Status: Cache HIT! Accelerated prefix read from KV memory.');
  } else {
    console.log('  Status: Cache MISS or below minimum token threshold.');
  }
}

async function executeCachingLifecycle(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ERROR: ANTHROPIC_API_KEY is not set.');
    process.exit(1);
  }

  const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
  const client = new Anthropic({ apiKey });

  const systemBlocks: Anthropic.Beta.PromptCaching.PromptCachingBetaTextBlockParam[] = [
    {
      type: 'text',
      text: SAMPLE_TECHNICAL_SPEC,
      cache_control: { type: 'ephemeral' },
    },
  ];

  console.log('=== Step 1: Initial Turn (Cache Creation) ===');
  const firstResponse = await client.messages.create({
    model,
    max_tokens: 150,
    system: systemBlocks,
    tools: SAMPLE_TOOLS,
    messages: [
      {
        role: 'user',
        content: 'According to Section 3, what are the minimum token thresholds for caching?',
      },
    ],
  });

  inspectCacheMetrics('Turn 1 (Initial Call)', firstResponse);

  console.log('\n=== Step 2: Follow-up Turn (Cache Read) ===');
  const secondResponse = await client.messages.create({
    model,
    max_tokens: 150,
    system: systemBlocks,
    tools: SAMPLE_TOOLS,
    messages: [
      {
        role: 'user',
        content: 'According to Section 3, what are the minimum token thresholds for caching?',
      },
      {
        role: 'assistant',
        content: firstResponse.content,
      },
      {
        role: 'user',
        content: 'What is the supervisor restart window specified in Section 1?',
      },
    ],
  });

  inspectCacheMetrics('Turn 2 (Cached Follow-up)', secondResponse);
}

executeCachingLifecycle().catch((err) => {
  console.error('Execution failed:', err);
  process.exit(1);
});
