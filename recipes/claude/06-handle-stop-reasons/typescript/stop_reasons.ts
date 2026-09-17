import Anthropic from '@anthropic-ai/sdk';
import type { Message, TextBlock } from '@anthropic-ai/sdk/resources/messages';

interface ContinuationOptions {
  client: Anthropic;
  prompt: string;
  system?: string;
  model?: string;
  maxTokensPerCall?: number;
  maxRounds?: number;
}

/**
 * Inspect and log stop_reason metadata from an Anthropic Message response.
 */
export function inspectStopReason(message: Message): void {
  console.log(`Message ID: ${message.id}`);
  console.log(`Model: ${message.model}`);
  console.log(`Stop Reason: ${message.stop_reason}`);
  console.log(`Stop Sequence: ${message.stop_sequence ?? 'none'}`);
  console.log(`Usage: Input=${message.usage.input_tokens}, Output=${message.usage.output_tokens}`);

  switch (message.stop_reason) {
    case 'end_turn':
      console.log('Status: Model finished natural completion.');
      break;
    case 'max_tokens':
      console.log('Status: Generation cut off due to max_tokens limit.');
      break;
    case 'stop_sequence':
      console.log(`Status: Custom stop sequence matched: ${message.stop_sequence}`);
      break;
    case 'tool_use':
      console.log('Status: Execution halted for tool invocation.');
      break;
    default:
      console.log(`Status: Unrecognized stop reason: ${message.stop_reason}`);
  }
}

/**
 * Execute a completion prompt and automatically continue across sequential
 * turns if the model terminates with stop_reason === 'max_tokens'.
 */
export async function generateWithContinuation({
  client,
  prompt,
  system,
  model = 'claude-3-5-sonnet-20241022',
  maxTokensPerCall = 1000,
  maxRounds = 5,
}: ContinuationOptions): Promise<string> {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: prompt },
  ];
  const accumulatedSegments: string[] = [];
  let round = 0;

  while (round < maxRounds) {
    round += 1;

    const response = await client.messages.create({
      model,
      max_tokens: maxTokensPerCall,
      messages,
      ...(system ? { system } : {}),
    });

    const roundText = response.content
      .filter((block): block is TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    accumulatedSegments.push(roundText);

    console.log(
      `[Round ${round}] Tokens: in=${response.usage.input_tokens}, out=${response.usage.output_tokens} | Stop Reason: ${response.stop_reason}`
    );

    if (response.stop_reason === 'end_turn') {
      break;
    } else if (response.stop_reason === 'max_tokens') {
      // Append assistant's partial output and prompt for seamless resumption
      messages.push({ role: 'assistant', content: roundText });
      messages.push({
        role: 'user',
        content:
          'Continue generating your output from the exact point where you were cut off. Do not repeat any prior text, acknowledge this instruction, or prepend commentary. Resume directly.',
      });
    } else if (response.stop_reason === 'stop_sequence') {
      console.log(`Halted on custom stop sequence: ${response.stop_sequence}`);
      break;
    } else if (response.stop_reason === 'tool_use') {
      console.log('Halted on tool invocation.');
      break;
    } else {
      console.log(`Halted on unhandled stop reason: ${response.stop_reason}`);
      break;
    }
  }

  return accumulatedSegments.join('');
}

/**
 * Stream Claude tokens in real time and extract stop_reason upon stream completion.
 */
export async function streamWithStopReasonCheck(
  client: Anthropic,
  prompt: string,
  maxTokens = 500,
  model = 'claude-3-5-sonnet-20241022'
): Promise<string> {
  const stream = await client.messages.create({
    model,
    max_tokens: maxTokens,
    stream: true,
    messages: [{ role: 'user', content: prompt }],
  });

  let fullText = '';

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      process.stdout.write(event.delta.text);
      fullText += event.delta.text;
    } else if (event.type === 'message_delta') {
      if (event.delta.stop_reason) {
        console.log(`\n[Stream Message Delta] Stop Reason: ${event.delta.stop_reason}`);
      }
    }
  }

  return fullText;
}

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ERROR: ANTHROPIC_API_KEY is not set in environment.');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });

  console.log('=== Demo 1: Triggering and Inspecting max_tokens Cutoff ===');
  const shortResp = await client.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 20,
    messages: [
      {
        role: 'user',
        content: 'Explain the Paxos consensus algorithm step by step.',
      },
    ],
  });
  inspectStopReason(shortResp);

  console.log('\n=== Demo 2: Triggering stop_sequence ===');
  const seqResp = await client.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 100,
    stop_sequences: ['--HALT--'],
    messages: [
      {
        role: 'user',
        content: 'Count numbers 1, 2, 3, 4, then insert --HALT--, then count 5, 6, 7.',
      },
    ],
  });
  inspectStopReason(seqResp);

  console.log('\n=== Demo 3: Automated Continuation Loop on max_tokens ===');
  const consolidated = await generateWithContinuation({
    client,
    prompt: 'Write an exhaustive 4-part guide detailing B-tree database indexing mechanics.',
    maxTokensPerCall: 80,
    maxRounds: 3,
  });

  console.log('\n--- Final Consolidated Output (Preview 200 chars) ---');
  console.log(consolidated.slice(0, 200) + '...');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Execution failed:', err);
    process.exit(1);
  });
}
