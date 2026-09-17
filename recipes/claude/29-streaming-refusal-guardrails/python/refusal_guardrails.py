"""
Streaming Refusal Guardrails and Fallback Loops for Claude Messages API.

Detects refusals, safety flags, and constraint failures during real-time streaming,
classifies refusal semantics, and executes deterministic fallbacks (canned responses,
constraint relaxation, or model escalation).
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import AsyncIterator, Callable, Dict, List, Optional
try:
    import anthropic
    from anthropic import AsyncAnthropic
except ImportError:
    anthropic = None
    AsyncAnthropic = None



class RefusalCategory(str, Enum):
    SAFETY = "safety"
    PROMPT_INJECTION = "prompt_injection"
    POLICY_CONSTRAINT = "policy_constraint"
    TOKEN_TRUNCATION = "token_truncation"
    NONE = "none"


class FallbackStrategy(str, Enum):
    STATIC_CAN_RESPONSE = "static_canned_response"
    RELAXED_CONSTRAINT_RETRY = "relaxed_constraint_retry"
    MODEL_ESCALATION = "model_escalation"
    TERMINATE = "terminate"


@dataclass
class StreamChunk:
    text: str
    is_refusal: bool = False
    refusal_category: RefusalCategory = RefusalCategory.NONE
    stop_reason: Optional[str] = None


@dataclass
class RefusalEvaluation:
    is_refusal: bool
    category: RefusalCategory
    reason: str
    confidence: float
    detected_phrases: List[str] = field(default_factory=list)


# Deterministic heuristics for classification when stop_reason is not explicit
REFUSAL_PATTERNS = {
    RefusalCategory.SAFETY: [
        r"i cannot fulfill this request",
        r"i am unable to assist with",
        r"i can't help with that",
        r"against safety guidelines",
        r"harmful or illegal",
        r"violates safety policies",
    ],
    RefusalCategory.PROMPT_INJECTION: [
        r"ignore previous instructions",
        r"system prompt override detected",
        r"unauthorized directive encountered",
        r"disregard all previous rules",
    ],
    RefusalCategory.POLICY_CONSTRAINT: [
        r"outside my operational guidelines",
        r"i am not allowed to generate code for",
        r"company policy prohibits",
        r"as an ai assistant, i cannot provide legal advice",
        r"i am not authorized to",
    ],
}


class RefusalClassifier:
    """Classifies streaming refusal responses based on stop reasons and early chunk patterns."""

    @staticmethod
    def evaluate_initial_chunk(accumulated_text: str, stop_reason: Optional[str] = None) -> RefusalEvaluation:
        # Check stop_reason first if message completed early
        if stop_reason == "refusal":
            return RefusalEvaluation(
                is_refusal=True,
                category=RefusalCategory.SAFETY,
                reason="Server explicit refusal stop reason triggered",
                confidence=1.0,
            )

        if stop_reason == "max_tokens":
            return RefusalEvaluation(
                is_refusal=False,
                category=RefusalCategory.TOKEN_TRUNCATION,
                reason="Stream reached max_tokens output limit",
                confidence=1.0,
            )

        lower_text = accumulated_text.lower().strip()
        if len(lower_text) < 15:
            return RefusalEvaluation(
                is_refusal=False,
                category=RefusalCategory.NONE,
                reason="Text buffer too short for refusal classification",
                confidence=0.0,
            )

        # Pattern match across categories
        for category, patterns in REFUSAL_PATTERNS.items():
            matched = []
            for pattern in patterns:
                if re.search(pattern, lower_text):
                    matched.append(pattern)
            if matched:
                return RefusalEvaluation(
                    is_refusal=True,
                    category=category,
                    reason=f"Matched refusal heuristics: {matched}",
                    confidence=0.92,
                    detected_phrases=matched,
                )

        return RefusalEvaluation(
            is_refusal=False,
            category=RefusalCategory.NONE,
            reason="No refusal triggers identified",
            confidence=0.0,
        )


class StreamingRefusalGuardrail:
    """
    Manages streaming responses from Claude Messages API with active refusal detection
    and multi-tier fallback routing.
    """

    def __init__(
        self,
        client: Optional[AsyncAnthropic] = None,
        primary_model: str = "claude-3-5-sonnet-20241022",
        fallback_model: str = "claude-3-5-haiku-20241022",
        inspection_token_threshold: int = 40,
    ):
        if client is not None:
            self.client = client
        elif AsyncAnthropic is not None:
            self.client = AsyncAnthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", "mock-key"))
        else:
            self.client = None
        self.primary_model = primary_model
        self.fallback_model = fallback_model
        self.inspection_token_threshold = inspection_token_threshold
        self.classifier = RefusalClassifier()

    def determine_fallback_strategy(self, evaluation: RefusalEvaluation) -> FallbackStrategy:
        if evaluation.category == RefusalCategory.SAFETY:
            return FallbackStrategy.STATIC_CAN_RESPONSE
        elif evaluation.category == RefusalCategory.POLICY_CONSTRAINT:
            return FallbackStrategy.RELAXED_CONSTRAINT_RETRY
        elif evaluation.category == RefusalCategory.PROMPT_INJECTION:
            return FallbackStrategy.STATIC_CAN_RESPONSE
        return FallbackStrategy.TERMINATE

    async def execute_stream_with_guardrail(
        self,
        messages: List[Dict[str, str]],
        system: Optional[str] = None,
        canned_response: str = "Our system cannot fulfill this specific request due to safety policies. Please rephrase your query.",
    ) -> AsyncIterator[StreamChunk]:
        """
        Streams response with early buffer inspection. If refusal is detected in the first N tokens
        or via stop_reason, intercepts output and yields the appropriate fallback stream.
        """
        accumulated_text = ""
        buffer_chunks: List[str] = []
        is_refusal_detected = False
        detected_eval: Optional[RefusalEvaluation] = None
        chunk_count = 0
        final_stop_reason = None

        try:
            async with self.client.messages.stream(
                model=self.primary_model,
                max_tokens=1024,
                system=system or "",
                messages=messages,
            ) as stream:
                async for text in stream.text_stream:
                    accumulated_text += text
                    buffer_chunks.append(text)
                    chunk_count += 1

                    # Inspect prefix buffer within token threshold
                    if chunk_count <= self.inspection_token_threshold:
                        eval_res = self.classifier.evaluate_initial_chunk(accumulated_text)
                        if eval_res.is_refusal:
                            is_refusal_detected = True
                            detected_eval = eval_res
                            break

                final_message = await stream.get_final_message()
                final_stop_reason = final_message.stop_reason

                if final_stop_reason == "refusal" and not is_refusal_detected:
                    is_refusal_detected = True
                    detected_eval = RefusalEvaluation(
                        is_refusal=True,
                        category=RefusalCategory.SAFETY,
                        reason="Server returned stop_reason=refusal",
                        confidence=1.0,
                    )

        except anthropic.APIError as e:
            yield StreamChunk(
                text=f"API connection error: {str(e)}",
                is_refusal=True,
                refusal_category=RefusalCategory.POLICY_CONSTRAINT,
            )
            return

        # If clean, flush buffer and yield remainder
        if not is_refusal_detected:
            for chunk in buffer_chunks:
                yield StreamChunk(text=chunk, is_refusal=False, stop_reason=final_stop_reason)
            return

        # Execute Fallback Strategy
        assert detected_eval is not None
        strategy = self.determine_fallback_strategy(detected_eval)

        if strategy == FallbackStrategy.STATIC_CAN_RESPONSE:
            yield StreamChunk(
                text=canned_response,
                is_refusal=True,
                refusal_category=detected_eval.category,
                stop_reason="fallback_canned",
            )

        elif strategy == FallbackStrategy.RELAXED_CONSTRAINT_RETRY:
            # Fallback retry with escalated model or relaxed constraints
            relaxed_prompt = [
                *messages,
                {
                    "role": "user",
                    "content": "Provide a high-level educational summary complying strictly with standard guidelines.",
                },
            ]
            async with self.client.messages.stream(
                model=self.fallback_model,
                max_tokens=512,
                system="You are a safe, concise technical guide.",
                messages=relaxed_prompt,
            ) as fallback_stream:
                async for text in fallback_stream.text_stream:
                    yield StreamChunk(
                        text=text,
                        is_refusal=False,
                        refusal_category=detected_eval.category,
                        stop_reason="fallback_relaxed_stream",
                    )
        else:
            yield StreamChunk(
                text="The request could not be completed safely.",
                is_refusal=True,
                refusal_category=detected_eval.category,
                stop_reason="fallback_terminated",
            )
