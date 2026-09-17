import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';
dotenv.config();

export enum RefusalCategory {
  SAFETY = 'safety',
  PROMPT_INJECTION = 'prompt_injection',
  POLICY_CONSTRAINT = 'policy_constraint',
  TOKEN_TRUNCATION = 'token_truncation',
  NONE = 'none',
}

export enum FallbackStrategy {
  STATIC_CANNED_RESPONSE = 'static_canned_response',
  RELAXED_CONSTRAINT_RETRY = 'relaxed_constraint_retry',
  MODEL_ESCALATION = 'model_escalation',
  TERMINATE = 'terminate',
}

export interface StreamChunk {
  text: string;
  isRefusal: boolean;
  category: RefusalCategory;
  stopReason?: string | null;
}

export interface RefusalEvaluation {
  isRefusal: boolean;
  category: RefusalCategory;
  reason: string;
  confidence: number;
}

const REFUSAL_PATTERNS: Record<RefusalCategory, RegExp[]> = {
  [RefusalCategory.SAFETY]: [
    /i cannot fulfill this request/i,
    /i am unable to assist with/i,
    /i can't help with that/i,
    /against safety guidelines/i,
    /harmful or illegal/i,
    /violates safety policies/i,
  ],
  [RefusalCategory.PROMPT_INJECTION]: [
    /ignore previous instructions/i,
    /system prompt override detected/i,
    /unauthorized directive encountered/i,
    /disregard all previous rules/i,
  ],
  [RefusalCategory.POLICY_CONSTRAINT]: [
    /outside my operational guidelines/i,
    /i am not allowed to generate code for/i,
    /company policy prohibits/i,
    /as an ai assistant, i cannot provide legal advice/i,
    /i am not authorized to/i,
  ],
  [RefusalCategory.TOKEN_TRUNCATION]: [],
  [RefusalCategory.NONE]: [],
};

export class RefusalClassifier {
  public static evaluateInitialChunk(accumulatedText: string, stopReason?: string | null): RefusalEvaluation {
    if (stopReason === 'refusal') {
      return {
        isRefusal: true,
        category: RefusalCategory.SAFETY,
        reason: 'Server explicit refusal stop reason triggered',
        confidence: 1.0,
      };
    }

    if (stopReason === 'max_tokens') {
      return {
        isRefusal: false,
        category: RefusalCategory.TOKEN_TRUNCATION,
        reason: 'Stream reached max_tokens limit',
        confidence: 1.0,
      };
    }

    const trimmed = accumulatedText.trim();
    if (trimmed.length < 15) {
      return {
        isRefusal: false,
        category: RefusalCategory.NONE,
        reason: 'Buffer too short for pattern matching',
        confidence: 0.0,
      };
    }

    for (const [cat, patterns] of Object.entries(REFUSAL_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(trimmed)) {
          return {
            isRefusal: true,
            category: cat as RefusalCategory,
            reason: `Matched pattern: ${pattern.source}`,
            confidence: 0.92,
          };
        }
      }
    }

    return {
      isRefusal: false,
      category: RefusalCategory.NONE,
      reason: 'No refusal pattern matched',
      confidence: 0.0,
    };
  }
}

export class StreamingRefusalGuardrail {
  private client: Anthropic;
  private primaryModel: string;
  private fallbackModel: string;
  private tokenThreshold: number;

  constructor(options?: {
    client?: Anthropic;
    primaryModel?: string;
    fallbackModel?: string;
    tokenThreshold?: number;
  }) {
    this.client = options?.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || 'mock-key' });
    this.primaryModel = options?.primaryModel ?? 'claude-3-5-sonnet-20241022';
    this.fallbackModel = options?.fallbackModel ?? 'claude-3-5-haiku-20241022';
    this.tokenThreshold = options?.tokenThreshold ?? 40;
  }

  public determineFallbackStrategy(evaluation: RefusalEvaluation): FallbackStrategy {
    switch (evaluation.category) {
      case RefusalCategory.SAFETY:
      case RefusalCategory.PROMPT_INJECTION:
        return FallbackStrategy.STATIC_CANNED_RESPONSE;
      case RefusalCategory.POLICY_CONSTRAINT:
        return FallbackStrategy.RELAXED_CONSTRAINT_RETRY;
      default:
        return FallbackStrategy.TERMINATE;
    }
  }

  public async *executeStream(params: {
    messages: Anthropic.MessageParam[];
    system?: string;
    cannedResponse?: string;
  }): AsyncGenerator<StreamChunk> {
    const canned =
      params.cannedResponse ??
      'Our system cannot fulfill this specific request due to safety policies. Please rephrase your query.';

    let accumulatedText = '';
    const bufferChunks: string[] = [];
    let isRefusal = false;
    let detectedEval: RefusalEvaluation | null = null;
    let chunkCount = 0;
    let finalStopReason: string | null = null;

    try {
      const stream = await this.client.messages.create({
        model: this.primaryModel,
        max_tokens: 1024,
        system: params.system,
        messages: params.messages,
        stream: true,
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          const delta = event.delta.text;
          accumulatedText += delta;
          bufferChunks.push(delta);
          chunkCount++;

          if (chunkCount <= this.tokenThreshold) {
            const ev = RefusalClassifier.evaluateInitialChunk(accumulatedText);
            if (ev.isRefusal) {
              isRefusal = true;
              detectedEval = ev;
              break;
            }
          }
        } else if (event.type === 'message_delta') {
          if (event.delta.stop_reason) {
            finalStopReason = event.delta.stop_reason;
            if (finalStopReason === 'refusal') {
              isRefusal = true;
              detectedEval = {
                isRefusal: true,
                category: RefusalCategory.SAFETY,
                reason: 'Stop reason is refusal',
                confidence: 1.0,
              };
              break;
            }
          }
        }
      }
    } catch (err: any) {
      yield {
        text: `API stream error: ${err.message}`,
        isRefusal: true,
        category: RefusalCategory.POLICY_CONSTRAINT,
      };
      return;
    }

    if (!isRefusal) {
      for (const chunk of bufferChunks) {
        yield {
          text: chunk,
          isRefusal: false,
          category: RefusalCategory.NONE,
          stopReason: finalStopReason,
        };
      }
      return;
    }

    // Handle detected refusal strategy
    const strategy = this.determineFallbackStrategy(detectedEval!);
    if (strategy === FallbackStrategy.STATIC_CANNED_RESPONSE) {
      yield {
        text: canned,
        isRefusal: true,
        category: detectedEval!.category,
        stopReason: 'fallback_canned',
      };
    } else if (strategy === FallbackStrategy.RELAXED_CONSTRAINT_RETRY) {
      const fallbackMessages: Anthropic.MessageParam[] = [
        ...params.messages,
        {
          role: 'user',
          content: 'Provide a high-level educational summary complying strictly with standard guidelines.',
        },
      ];

      const fallbackStream = await this.client.messages.create({
        model: this.fallbackModel,
        max_tokens: 512,
        system: 'You are a safe, concise technical guide.',
        messages: fallbackMessages,
        stream: true,
      });

      for await (const event of fallbackStream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield {
            text: event.delta.text,
            isRefusal: false,
            category: detectedEval!.category,
            stopReason: 'fallback_relaxed_stream',
          };
        }
      }
    } else {
      yield {
        text: 'The request could not be completed safely.',
        isRefusal: true,
        category: detectedEval!.category,
        stopReason: 'fallback_terminated',
      };
    }
  }
}
