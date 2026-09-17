#!/usr/bin/env python3
"""
Extract Reasoning Traces and Maintain Thought Signatures in Claude Messages API.
Demonstrates:
1. Enabling extended thinking with a specified budget.
2. Parsing content blocks to separate thinking blocks from text blocks.
3. Cryptographic thought signature retention when serializing assistant turns back into multi-turn conversations.
4. Offline mock validation and live Anthropic SDK execution.
"""

from dataclasses import dataclass
from typing import Any, Dict, List, Optional
import json
import os

@dataclass
class ReasoningTraceResult:
    thinking_blocks: List[Dict[str, str]]
    text_blocks: List[Dict[str, str]]
    full_assistant_message: Dict[str, Any]
    thinking_tokens_estimate: int
    has_valid_signatures: bool

def parse_response_content(content_blocks: List[Any]) -> ReasoningTraceResult:
    """
    Parses response content blocks from the Claude Messages API, separating
    extended thinking blocks from visible text blocks and verifying signature presence.
    """
    thinking_blocks: List[Dict[str, str]] = []
    text_blocks: List[Dict[str, str]] = []
    serialized_blocks: List[Dict[str, Any]] = []
    has_signatures = True

    for block in content_blocks:
        # Handle both SDK response objects (attributes) and dictionary payloads
        if hasattr(block, "type"):
            b_type = block.type
            if b_type == "thinking":
                thought_text = getattr(block, "thinking", "")
                sig = getattr(block, "signature", "")
                thinking_blocks.append({"thinking": thought_text, "signature": sig})
                serialized_blocks.append({
                    "type": "thinking",
                    "thinking": thought_text,
                    "signature": sig,
                })
                if not sig:
                    has_signatures = False
            elif b_type == "text":
                text_content = getattr(block, "text", "")
                text_blocks.append({"text": text_content})
                serialized_blocks.append({"type": "text", "text": text_content})
        elif isinstance(block, dict):
            b_type = block.get("type", "")
            if b_type == "thinking":
                thought_text = block.get("thinking", "")
                sig = block.get("signature", "")
                thinking_blocks.append({"thinking": thought_text, "signature": sig})
                serialized_blocks.append({
                    "type": "thinking",
                    "thinking": thought_text,
                    "signature": sig,
                })
                if not sig:
                    has_signatures = False
            elif b_type == "text":
                text_content = block.get("text", "")
                text_blocks.append({"text": text_content})
                serialized_blocks.append({"type": "text", "text": text_content})

    total_thinking_chars = sum(len(tb["thinking"]) for tb in thinking_blocks)
    estimated_tokens = total_thinking_chars // 4

    return ReasoningTraceResult(
        thinking_blocks=thinking_blocks,
        text_blocks=text_blocks,
        full_assistant_message={"role": "assistant", "content": serialized_blocks},
        thinking_tokens_estimate=estimated_tokens,
        has_valid_signatures=has_signatures and len(thinking_blocks) > 0,
    )

def append_assistant_turn(
    conversation_history: List[Dict[str, Any]],
    assistant_result: ReasoningTraceResult,
    next_user_query: str,
) -> List[Dict[str, Any]]:
    """
    Appends the complete assistant turn with thinking blocks and cryptographic signatures intact,
    followed by the subsequent user turn. This satisfies Anthropic's requirement for multi-turn thinking.
    """
    updated_history = list(conversation_history)
    updated_history.append(assistant_result.full_assistant_message)
    updated_history.append({"role": "user", "content": next_user_query})
    return updated_history

def run_reasoning_pipeline(
    client,
    model: str = "claude-3-7-sonnet-20250219",
    budget_tokens: int = 2048,
) -> None:
    """
    Executes a multi-turn conversation using extended thinking with the Anthropic Python SDK.
    """
    print(f"Executing reasoning pipeline with model '{model}' (Thinking budget: {budget_tokens} tokens)...")
    
    # Turn 1: Initial complex question
    turn1_prompt = "Calculate the probability of drawing at least 3 aces in a 5-card poker hand from a standard 52-card deck. Show your step-by-step reasoning."
    history = [{"role": "user", "content": turn1_prompt}]

    response1 = client.messages.create(
        model=model,
        max_tokens=4096,
        thinking={"type": "enabled", "budget_tokens": budget_tokens},
        messages=history,
    )

    result1 = parse_response_content(response1.content)
    print(f"\n--- Turn 1 Response Received ---")
    print(f"Thinking blocks found: {len(result1.thinking_blocks)}")
    for idx, tb in enumerate(result1.thinking_blocks, start=1):
        preview = tb["thinking"][:120].replace("\n", " ")
        sig_preview = tb["signature"][:24] + "..." if len(tb["signature"]) > 24 else tb["signature"]
        print(f"  [Thinking Block {idx}] Preview: {preview}...")
        print(f"  [Thought Signature {idx}]: {sig_preview}")

    print(f"\nVisible Answer:")
    for tb in result1.text_blocks:
        print(tb["text"])

    # Turn 2: Follow-up question passing back the assistant turn with signature intact
    print("\n--- Preparing Turn 2 Request with Intact Thought Signatures ---")
    history = append_assistant_turn(
        history,
        result1,
        "What if 1 ace is already revealed to be in the hand? Recalculate the conditional probability.",
    )

    response2 = client.messages.create(
        model=model,
        max_tokens=4096,
        thinking={"type": "enabled", "budget_tokens": budget_tokens},
        messages=history,
    )

    result2 = parse_response_content(response2.content)
    print(f"\n--- Turn 2 Response Received ---")
    print(f"Thinking blocks found: {len(result2.thinking_blocks)}")
    print(f"Visible Answer:")
    for tb in result2.text_blocks:
        print(tb["text"])

if __name__ == "__main__":
    print("=== Claude Reasoning Trace & Thought Signature Validator ===")
    
    # 1. Deterministic Mock Test to verify block parsing & serialization
    mock_response = [
        {
            "type": "thinking",
            "thinking": "Let N be the deck size 52, K be the number of aces 4. We want P(X >= 3) where X is hypergeometric...",
            "signature": "Ev4BCkUKCQgBGB8iAwoDCiB4...",
        },
        {
            "type": "text",
            "text": "The probability of drawing at least 3 aces in a 5-card hand is approximately 0.00181 (or 0.181%).",
        },
    ]
    parsed = parse_response_content(mock_response)
    print(f"Mock Parsed Thinking Blocks: {len(parsed.thinking_blocks)}")
    print(f"Mock Parsed Text Blocks: {len(parsed.text_blocks)}")
    print(f"Signatures Present & Valid: {parsed.has_valid_signatures}")
    print(f"Estimated Thinking Tokens: {parsed.thinking_tokens_estimate}")
    
    mock_history = [{"role": "user", "content": "What is the probability?"}]
    updated = append_assistant_turn(mock_history, parsed, "Can you recalculate with 48 cards?")
    print(f"Multi-turn History Length: {len(updated)} turns (Assistant turn preserved with signature)")
    assert updated[1]["content"][0]["type"] == "thinking"
    assert "signature" in updated[1]["content"][0]
    print("Deterministic assertion passed: Thought signature maintained in serialized history.\n")

    # 2. Live execution if API key is configured
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if api_key:
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=api_key)
            run_reasoning_pipeline(client)
        except ImportError:
            print("Note: anthropic Python SDK not installed. Run 'pip install anthropic' to execute live pipeline.")
    else:
        print("Note: Set ANTHROPIC_API_KEY to run live API calls with Claude 3.7 Sonnet extended thinking.")
