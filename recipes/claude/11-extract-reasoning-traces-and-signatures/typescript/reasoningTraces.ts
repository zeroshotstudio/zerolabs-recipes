import Anthropic from '@anthropic-ai/sdk';

export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
  signature: string;
}

export interface TextBlock {
  type: 'text';
  text: string;
}

export type AssistantContentBlock = ThinkingBlock | TextBlock;

export interface AssistantMessageTurn {
  role: 'assistant';
  content: AssistantContentBlock[];
}

export interface UserMessageTurn {
  role: 'user';
  content: string;
}

export type ConversationTurn = AssistantMessageTurn | UserMessageTurn;

export interface ExtractedReasoningResult {
  thinkingBlocks: ThinkingBlock[];
  textBlocks: TextBlock[];
  fullAssistantMessage: AssistantMessageTurn;
  thinkingCharacterCount: number;
  hasValidSignatures: boolean;
}

/**
 * Parses response content blocks from the Claude Messages API, isolating
 * reasoning traces and validating cryptographic signature presence.
 */
export function parseResponseContent(
  blocks: Array<{ type: string; [key: string]: any }>
): ExtractedReasoningResult {
  const thinkingBlocks: ThinkingBlock[] = [];
  const textBlocks: TextBlock[] = [];
  const serializedBlocks: AssistantContentBlock[] = [];
  let hasValidSignatures = true;

  for (const block of blocks) {
    if (block.type === 'thinking') {
      const tb: ThinkingBlock = {
        type: 'thinking',
        thinking: typeof block.thinking === 'string' ? block.thinking : '',
        signature: typeof block.signature === 'string' ? block.signature : '',
      };
      thinkingBlocks.push(tb);
      serializedBlocks.push(tb);
      if (!tb.signature) {
        hasValidSignatures = false;
      }
    } else if (block.type === 'text') {
      const txt: TextBlock = {
        type: 'text',
        text: typeof block.text === 'string' ? block.text : '',
      };
      textBlocks.push(txt);
      serializedBlocks.push(txt);
    }
  }

  const thinkingCharacterCount = thinkingBlocks.reduce(
    (acc, cur) => acc + cur.thinking.length,
    0
  );

  return {
    thinkingBlocks,
    textBlocks,
    fullAssistantMessage: {
      role: 'assistant',
      content: serializedBlocks,
    },
    thinkingCharacterCount,
    hasValidSignatures: hasValidSignatures && thinkingBlocks.length > 0,
  };
}

/**
 * Appends the assistant turn with thought signatures intact, then appends the next user turn.
 * Ensures strict compliance with Claude extended thinking multi-turn protocols.
 */
export function appendConversationTurn(
  history: ConversationTurn[],
  assistantResult: ExtractedReasoningResult,
  nextUserQuery: string
): ConversationTurn[] {
  return [
    ...history,
    assistantResult.fullAssistantMessage,
    { role: 'user', content: nextUserQuery },
  ];
}

/**
 * Executes a 2-turn extended thinking workflow using the official TypeScript SDK.
 */
export async function runReasoningSession(
  client: Anthropic,
  model = 'claude-3-7-sonnet-20250219',
  budgetTokens = 2048
): Promise<void> {
  const initialUserTurn: ConversationTurn = {
    role: 'user',
    content:
      'Prove that the square root of 2 is irrational using proof by contradiction. Show your internal reasoning.',
  };

  let history: ConversationTurn[] = [initialUserTurn];

  console.log(`Sending Turn 1 to ${model} with thinking budget of ${budgetTokens} tokens...`);
  const response1 = await client.messages.create({
    model,
    max_tokens: 4096,
    thinking: { type: 'enabled', budget_tokens: budgetTokens },
    messages: history as any,
  });

  const parsed1 = parseResponseContent(response1.content);
  console.log(`\nTurn 1 Extracted Thinking Blocks: ${parsed1.thinkingBlocks.length}`);
  for (let i = 0; i < parsed1.thinkingBlocks.length; i++) {
    const b = parsed1.thinkingBlocks[i];
    console.log(`[Thinking Block ${i + 1} Preview]: ${b.thinking.slice(0, 100).replace(/\n/g, ' ')}...`);
    console.log(`[Thought Signature ${i + 1}]: ${b.signature.slice(0, 24)}...`);
  }

  console.log('\nVisible Text Answer:');
  for (const t of parsed1.textBlocks) {
    console.log(t.text);
  }

  // Turn 2: Preserving signatures in multi-turn conversation
  console.log('\n--- Emitting Turn 2 (Passing Thinking Blocks + Signatures Intact) ---');
  history = appendConversationTurn(
    history,
    parsed1,
    'Now extend this proof to show that the square root of 3 is also irrational.'
  );

  const response2 = await client.messages.create({
    model,
    max_tokens: 4096,
    thinking: { type: 'enabled', budget_tokens: budgetTokens },
    messages: history as any,
  });

  const parsed2 = parseResponseContent(response2.content);
  console.log(`\nTurn 2 Extracted Thinking Blocks: ${parsed2.thinkingBlocks.length}`);
  console.log('Visible Text Answer:');
  for (const t of parsed2.textBlocks) {
    console.log(t.text);
  }
}

// Verification runner
const mockPayload = [
  {
    type: 'thinking',
    thinking: 'Assume sqrt(2) = a/b where a and b are coprime integers...',
    signature: 'Ev4BCkUKCQgBGB8iAwoDCiB4Q92...',
  },
  {
    type: 'text',
    text: 'Assume for contradiction that sqrt(2) is rational...',
  },
];

const mockResult = parseResponseContent(mockPayload);
console.log('=== TypeScript Reasoning Trace Extraction Test ===');
console.log(`Parsed thinking blocks: ${mockResult.thinkingBlocks.length}`);
console.log(`Parsed text blocks:     ${mockResult.textBlocks.length}`);
console.log(`Has valid signature:    ${mockResult.hasValidSignatures}`);
console.log(`Thinking chars:         ${mockResult.thinkingCharacterCount}`);

const mockHist: ConversationTurn[] = [{ role: 'user', content: 'Prove sqrt(2)' }];
const multiHist = appendConversationTurn(mockHist, mockResult, 'Next step?');
console.log(`Multi-turn conversation length: ${multiHist.length}`);
console.log('TypeScript verification complete.\n');
