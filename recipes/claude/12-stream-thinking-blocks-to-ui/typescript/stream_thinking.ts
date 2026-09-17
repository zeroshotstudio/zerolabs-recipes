/**
 * Stream Thinking Blocks to User Interfaces in TypeScript.
 *
 * Demonstrates real-time Server-Sent Event (SSE) parsing, handling:
 * - content_block_start (type: "thinking")
 * - content_block_delta (type: "thinking_delta")
 * - content_block_delta (type: "signature_delta")
 * - content_block_stop
 * - content_block_start (type: "text")
 * - content_block_delta (type: "text_delta")
 * - content_block_stop
 *
 * Implements a state machine suitable for driving collapsible UI accordion components.
 */

import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.ANTHROPIC_API_KEY;
const model = process.env.ANTHROPIC_MODEL || 'claude-3-7-sonnet-20250219';

if (!apiKey) {
  console.error('ERROR: ANTHROPIC_API_KEY environment variable is missing.');
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey });

export type StreamUIState = 'idle' | 'thinking' | 'answering' | 'completed' | 'error';

export interface UIThinkingAccordionState {
  uiState: StreamUIState;
  thinkingContent: string;
  signature: string;
  textContent: string;
  thinkingStartTime: number | null;
  thinkingDurationMs: number;
  textStartTime: number | null;
  textDurationMs: number;
  isAccordionExpanded: boolean;
}

/**
 * Initializes fresh UI stream state.
 */
export function createInitialUIState(): UIThinkingAccordionState {
  return {
    uiState: 'idle',
    thinkingContent: '',
    signature: '',
    textContent: '',
    thinkingStartTime: null,
    thinkingDurationMs: 0,
    textStartTime: null,
    textDurationMs: 0,
    isAccordionExpanded: true,
  };
}

/**
 * Processes stream events and updates the UI thinking accordion state.
 */
export async function streamThinkingToUI(
  userPrompt: string,
  thinkingBudget: number = 2048,
  onStateUpdate?: (state: UIThinkingAccordionState) => void
): Promise<UIThinkingAccordionState> {
  const state = createInitialUIState();

  console.log(`[INIT] Streaming from ${model} with thinking budget: ${thinkingBudget} tokens`);
  console.log('='.repeat(65));

  const stream = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    thinking: {
      type: 'enabled',
      budget_tokens: thinkingBudget,
    },
    stream: true,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
  });

  for await (const event of stream) {
    switch (event.type) {
      case 'content_block_start': {
        const block = event.content_block;
        if (block.type === 'thinking') {
          state.uiState = 'thinking';
          state.thinkingStartTime = Date.now();
          state.isAccordionExpanded = true;
          console.log('\n>>> [UI EVENT] Thinking Block Started -> Accordion Opened');
        } else if (block.type === 'text') {
          state.uiState = 'answering';
          state.textStartTime = Date.now();
          // In web clients, collapse accordion automatically or keep minimized badge
          state.isAccordionExpanded = false;
          console.log('\n>>> [UI EVENT] Text Answer Started -> Accordion Collapsed');
        }
        onStateUpdate?.(state);
        break;
      }

      case 'content_block_delta': {
        const delta = event.delta;
        if (delta.type === 'thinking_delta') {
          state.thinkingContent += delta.thinking;
          process.stdout.write(`\r[THINKING ACCORDION] Streaming tokens... (${state.thinkingContent.length} chars)`);
          onStateUpdate?.(state);
        } else if (delta.type === 'signature_delta') {
          state.signature += delta.signature;
          console.log(`\n[SIGNATURE] Encrypted block signature captured (${state.signature.length} bytes)`);
          onStateUpdate?.(state);
        } else if (delta.type === 'text_delta') {
          state.textContent += delta.text;
          process.stdout.write(delta.text);
          onStateUpdate?.(state);
        }
        break;
      }

      case 'content_block_stop': {
        if (state.uiState === 'thinking') {
          if (state.thinkingStartTime) {
            state.thinkingDurationMs = Date.now() - state.thinkingStartTime;
          }
          console.log(`\n>>> [UI EVENT] Thinking Block Closed in ${state.thinkingDurationMs}ms`);
        } else if (state.uiState === 'answering') {
          if (state.textStartTime) {
            state.textDurationMs = Date.now() - state.textStartTime;
          }
          console.log(`\n>>> [UI EVENT] Text Block Closed in ${state.textDurationMs}ms`);
        }
        onStateUpdate?.(state);
        break;
      }

      case 'message_stop': {
        state.uiState = 'completed';
        console.log('\n>>> [UI EVENT] Stream Finalized');
        onStateUpdate?.(state);
        break;
      }
    }
  }

  console.log('\n' + '='.repeat(65));
  console.log('CLIENT ACCORDION METRICS:');
  console.log(`Thinking Duration: ${state.thinkingDurationMs} ms`);
  console.log(`Answer Duration:   ${state.textDurationMs} ms`);
  console.log(`Thinking Bytes:    ${state.thinkingContent.length}`);
  console.log(`Answer Bytes:      ${state.textContent.length}`);
  console.log(`Signature Length:  ${state.signature.length}`);
  console.log('='.repeat(65));

  return state;
}

// Direct execution entrypoint
async function main() {
  const prompt =
    'Design a real-time reactive event architecture in TypeScript for handling concurrent SSE streams without memory leaks. Provide the structural trade-offs first, followed by code.';

  try {
    await streamThinkingToUI(prompt, 2048);
  } catch (err) {
    console.error('Streaming failure:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
