import Anthropic from '@anthropic-ai/sdk';

export interface ModelPricing {
  baseInput: number;   // $/MTok
  cacheWrite: number;  // $/MTok
  cacheRead: number;   // $/MTok
  output: number;      // $/MTok
}

export const MODEL_PRICING_RATES: Record<string, ModelPricing> = {
  'claude-3-5-sonnet-20241022': {
    baseInput: 3.0,
    cacheWrite: 3.75,
    cacheRead: 0.3,
    output: 15.0,
  },
  'claude-3-haiku-20240307': {
    baseInput: 0.25,
    cacheWrite: 0.3,
    cacheRead: 0.03,
    output: 1.25,
  },
  'claude-3-opus-20240229': {
    baseInput: 15.0,
    cacheWrite: 18.75,
    cacheRead: 1.5,
    output: 75.0,
  },
};

export interface EconomicAssessment {
  uncachedTotal: number;
  cachedTotal: number;
  netSavings: number;
  savingsPercentage: number;
  amortizedCostPerTurn: number;
  breakEvenHits: number;
}

export function calculateCostEconomics(
  model: string,
  cachedTokens: number,
  uncachedInputTokens: number,
  outputTokens: number,
  totalTurns: number
): EconomicAssessment {
  const rates = MODEL_PRICING_RATES[model] || MODEL_PRICING_RATES['claude-3-5-sonnet-20241022'];

  const uncachedTurnCost =
    ((cachedTokens + uncachedInputTokens) / 1_000_000) * rates.baseInput +
    (outputTokens / 1_000_000) * rates.output;
  const uncachedTotal = uncachedTurnCost * totalTurns;

  const turn1Cost =
    (cachedTokens / 1_000_000) * rates.cacheWrite +
    (uncachedInputTokens / 1_000_000) * rates.baseInput +
    (outputTokens / 1_000_000) * rates.output;

  const subsequentTurnCost =
    (cachedTokens / 1_000_000) * rates.cacheRead +
    (uncachedInputTokens / 1_000_000) * rates.baseInput +
    (outputTokens / 1_000_000) * rates.output;

  let cachedTotal = turn1Cost;
  if (totalTurns > 1) {
    cachedTotal += subsequentTurnCost * (totalTurns - 1);
  }

  const netSavings = uncachedTotal - cachedTotal;
  const savingsPercentage = uncachedTotal > 0 ? (netSavings / uncachedTotal) * 100 : 0;
  const amortizedCostPerTurn = totalTurns > 0 ? cachedTotal / totalTurns : 0;

  return {
    uncachedTotal: Number(uncachedTotal.toFixed(6)),
    cachedTotal: Number(cachedTotal.toFixed(6)),
    netSavings: Number(netSavings.toFixed(6)),
    savingsPercentage: Number(savingsPercentage.toFixed(2)),
    amortizedCostPerTurn: Number(amortizedCostPerTurn.toFixed(6)),
    breakEvenHits: 2,
  };
}

export async function runCachedPipeline(
  client: Anthropic,
  systemPrompt: string,
  prompts: string[],
  model = 'claude-3-5-sonnet-20241022'
): Promise<void> {
  for (let i = 0; i < prompts.length; i++) {
    const response = await client.messages.create({
      model,
      max_tokens: 100,
      system: [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: prompts[i] }],
    });

    const usage = response.usage as {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };

    const creation = usage.cache_creation_input_tokens ?? 0;
    const read = usage.cache_read_input_tokens ?? 0;
    const status = creation > 0 ? 'CACHE WRITE' : read > 0 ? 'CACHE HIT' : 'UNCACHED';

    console.log(
      `Turn ${i + 1} [${status}]: base_in=${usage.input_tokens}, write=${creation}, read=${read}, out=${usage.output_tokens}`
    );
  }
}

// Execute simulation if run directly
const sim = calculateCostEconomics('claude-3-5-sonnet-20241022', 25000, 250, 300, 20);
console.log('TypeScript Cost Simulation (25,000 cached tokens, 20 requests):');
console.log(`  Uncached: $${sim.uncachedTotal.toFixed(4)}`);
console.log(`  Cached:   $${sim.cachedTotal.toFixed(4)}`);
console.log(`  Savings:  $${sim.netSavings.toFixed(4)} (${sim.savingsPercentage}%)`);
console.log(`  Amortized / Turn: $${sim.amortizedCostPerTurn.toFixed(4)}`);
