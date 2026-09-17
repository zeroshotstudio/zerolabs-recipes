import Anthropic from '@anthropic-ai/sdk';
import type { Message, ThinkingBlock, TextBlock } from '@anthropic-ai/sdk/resources/messages';

/**
 * Executes a Claude Messages API request with extended thinking enabled.
 */
async function runThinkingQuery(
  prompt: string,
  budgetTokens: number = 2048,
  maxTokens: number = 4096,
  model: string = 'claude-3-7-sonnet-20250219'
): Promise<Message> {
  if (budgetTokens < 1024) {
    throw new Error(`budget_tokens must be >= 1024, received ${budgetTokens}`);
  }

  if (maxTokens <= budgetTokens) {
    throw new Error(
      `max_tokens (${maxTokens}) must be strictly greater than budget_tokens (${budgetTokens})`
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ERROR: ANTHROPIC_API_KEY environment variable is required.');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });

  console.log(`Dispatching request with thinking budget: ${budgetTokens} tokens (max_tokens: ${maxTokens})...`);

  // Note: temperature, top_p, and top_k must remain at default values when thinking is enabled
  const message = await client.messages.create({
    model,
    max_tokens: maxTokens,
    thinking: {
      type: 'enabled',
      budget_tokens: budgetTokens,
    },
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  return message;
}

/**
 * Parses and displays thinking traces, cryptographic signatures, and token accounting.
 */
function inspectThinkingResponse(message: Message): void {
  console.log('='.repeat(65));
  console.log(`Message ID : ${message.id}`);
  console.log(`Model      : ${message.model}`);
  console.log(`Stop Reason: ${message.stop_reason}`);
  console.log('-'.repeat(65));

  for (const block of message.content) {
    if (block.type === 'thinking') {
      const thinkingBlock = block as ThinkingBlock;
      console.log('\n--- Model Reasoning Trace (Extended Thinking) ---');
      const trace = thinkingBlock.thinking.trim();
      if (trace.length > 300) {
        console.log(`${trace.slice(0, 300)}...\n[Truncated reasoning trace: ${trace.length} chars total]`);
      } else {
        console.log(trace);
      }
      if (thinkingBlock.signature) {
        console.log(`Verification Signature: ${thinkingBlock.signature.slice(0, 32)}...`);
      }
    } else if (block.type === 'text') {
      const textBlock = block as TextBlock;
      console.log('\n--- Final Synthesized Response ---');
      const output = textBlock.text.trim();
      if (output.length > 300) {
        console.log(`${output.slice(0, 300)}...`);
      } else {
        console.log(output);
      }
    }
  }

  console.log('-'.repeat(65));
  console.log('Token Usage Breakdown:');
  console.log(`  Input Tokens : ${message.usage.input_tokens}`);
  console.log(`  Output Tokens: ${message.usage.output_tokens}`);
  console.log('='.repeat(65));
}

async function main(): Promise<void> {
  const prompt =
    'Analyze the architectural trade-offs between Raft consensus and Paxos ' +
    'when designing a globally distributed write-heavy coordination service. ' +
    'Summarize key failure recovery bottlenecks.';

  const budget = parseInt(process.env.THINKING_BUDGET_TOKENS || '2048', 10);
  const maxTokens = parseInt(process.env.MAX_TOKENS || '4096', 10);
  const model = process.env.ANTHROPIC_MODEL || 'claude-3-7-sonnet-20250219';

  try {
    const response = await runThinkingQuery(prompt, budget, maxTokens, model);
    inspectThinkingResponse(response);
  } catch (error) {
    console.error('Execution failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
