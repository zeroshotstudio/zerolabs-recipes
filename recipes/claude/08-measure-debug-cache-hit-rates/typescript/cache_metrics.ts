import Anthropic from '@anthropic-ai/sdk';
import type { Message, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages';

export interface CacheMetrics {
  inputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  outputTokens: number;
  latencyMs: number;
  totalPromptTokens: number;
  cacheHitRatePct: number;
  costSavingsPct: number;
}

/**
 * Calculates cache hit metrics, token aggregates, and estimated savings
 * from an Anthropic Messages API response.
 */
export function calculateCacheMetrics(message: Message, durationMs: number): CacheMetrics {
  const usage = message.usage as unknown as {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  };

  const inputTokens = usage.input_tokens || 0;
  const cacheCreationInputTokens = usage.cache_creation_input_tokens || 0;
  const cacheReadInputTokens = usage.cache_read_input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;

  const totalPromptTokens = inputTokens + cacheCreationInputTokens + cacheReadInputTokens;
  const cacheHitRatePct =
    totalPromptTokens > 0 ? (cacheReadInputTokens / totalPromptTokens) * 100 : 0;

  // Pricing model:
  // Standard input: 1.0x
  // Cache creation: 1.25x (5-min TTL write)
  // Cache read: 0.10x (90% discount)
  const baseline = totalPromptTokens * 1.0;
  const actual =
    inputTokens * 1.0 + cacheCreationInputTokens * 1.25 + cacheReadInputTokens * 0.10;
  const costSavingsPct =
    baseline > 0 ? Math.max(0, ((baseline - actual) / baseline) * 100) : 0;

  return {
    inputTokens,
    cacheCreationInputTokens,
    cacheReadInputTokens,
    outputTokens,
    latencyMs: Math.round(durationMs * 10) / 10,
    totalPromptTokens,
    cacheHitRatePct: Math.round(cacheHitRatePct * 100) / 100,
    costSavingsPct: Math.round(costSavingsPct * 100) / 100,
  };
}

/**
 * Telemetry wrapper client that instruments Anthropic calls with cache observability.
 */
export class CachedAnthropicTelemetry {
  private client: Anthropic;
  public history: CacheMetrics[] = [];

  constructor(client: Anthropic) {
    this.client = client;
  }

  async createMessage(
    params: MessageCreateParamsNonStreaming
  ): Promise<{ message: Message; metrics: CacheMetrics }> {
    const startTime = performance.now();
    const message = await this.client.messages.create(params);
    const durationMs = performance.now() - startTime;

    const metrics = calculateCacheMetrics(message, durationMs);
    this.history.push(metrics);
    this.logMetrics(metrics);

    return { message, metrics };
  }

  logMetrics(m: CacheMetrics): void {
    const status =
      m.cacheReadInputTokens > 0
        ? 'HIT'
        : m.cacheCreationInputTokens > 0
        ? 'WRITE'
        : 'MISS';
    console.log(
      `[Telemetry] Status: ${status} | Hit Rate: ${m.cacheHitRatePct}% | ` +
        `Read: ${m.cacheReadInputTokens} tok | Created: ${m.cacheCreationInputTokens} tok | ` +
        `Uncached: ${m.inputTokens} tok | Latency: ${m.latencyMs}ms | ` +
        `Est Savings: ${m.costSavingsPct}%`
    );
  }

  getAggregateSummary(): {
    requests: number;
    avgHitRatePct: number;
    totalCacheReadTokens: number;
    totalCacheCreationTokens: number;
    totalUncachedTokens: number;
  } {
    if (this.history.length === 0) {
      return {
        requests: 0,
        avgHitRatePct: 0,
        totalCacheReadTokens: 0,
        totalCacheCreationTokens: 0,
        totalUncachedTokens: 0,
      };
    }

    const totalRead = this.history.reduce((acc, m) => acc + m.cacheReadInputTokens, 0);
    const totalCreated = this.history.reduce((acc, m) => acc + m.cacheCreationInputTokens, 0);
    const totalUncached = this.history.reduce((acc, m) => acc + m.inputTokens, 0);
    const totalPrompt = totalRead + totalCreated + totalUncached;

    const avgHitRate = totalPrompt > 0 ? (totalRead / totalPrompt) * 100 : 0;

    return {
      requests: this.history.length,
      avgHitRatePct: Math.round(avgHitRate * 100) / 100,
      totalCacheReadTokens: totalRead,
      totalCacheCreationTokens: totalCreated,
      totalUncachedTokens: totalUncached,
    };
  }
}

/**
 * Diagnostic runner comparing cold write, warm read, and mutated prefix scenarios.
 */
export async function runCacheDiagnosticDemo(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ERROR: ANTHROPIC_API_KEY environment variable is not set.');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });
  const telemetry = new CachedAnthropicTelemetry(client);

  const largeDocumentation =
    'Enterprise Architecture Specifications Version 4.2.1. ' +
    'System protocol documentation block for cluster validation. '.repeat(120);

  console.log('\n--- 1. Cold Call: Initial Cache Creation ---');
  await telemetry.createMessage({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 100,
    system: [
      {
        type: 'text',
        text: largeDocumentation,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: 'Confirm system readiness in one word.' }],
  });

  console.log('\n--- 2. Warm Call: Deterministic Cache Read ---');
  await telemetry.createMessage({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 100,
    system: [
      {
        type: 'text',
        text: largeDocumentation,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: 'Summarize protocol requirements.' }],
  });

  console.log('\n--- 3. Busted Call: Mutated Prefix Timestamp ---');
  const mutatedDoc = `Generated at ${Date.now()}: ${largeDocumentation}`;
  await telemetry.createMessage({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 100,
    system: [
      {
        type: 'text',
        text: mutatedDoc,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: 'Summarize protocol requirements.' }],
  });

  console.log('\n--- Aggregate Telemetry Summary ---');
  console.log(telemetry.getAggregateSummary());
}

if (process.argv.includes('--demo')) {
  runCacheDiagnosticDemo().catch(console.error);
} else {
  console.log('CachedAnthropicTelemetry module loaded. Pass --demo to execute live API tests.');
}
