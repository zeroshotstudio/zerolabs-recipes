import os
import sys
import time
from dotenv import load_dotenv
import anthropic
from anthropic import Anthropic, RateLimitError, InternalServerError, APIConnectionError, APIStatusError

# Load environment variables
load_dotenv()

api_key = os.environ.get("ANTHROPIC_API_KEY")
if not api_key:
    print("Error: ANTHROPIC_API_KEY is not set.")
    sys.exit(1)

client = Anthropic(api_key=api_key)

def probe_models():
    """Query available Claude models via client.models.list()."""
    print("--- 1. Probing Models Endpoint ---")
    start = time.perf_counter()
    try:
        response = client.models.list(limit=20)
        elapsed_ms = (time.perf_counter() - start) * 1000
        print(f"Status: OK (Retrieved models in {elapsed_ms:.2f} ms)")
        model_ids = [m.id for m in response.data]
        print(f"Total models available: {len(model_ids)}")
        for mid in model_ids[:5]:
            print(f"  - {mid}")
        return True, elapsed_ms
    except RateLimitError as e:
        print(f"Rate limited (HTTP 429): {e.message}")
        return False, None
    except InternalServerError as e:
        print(f"Anthropic Overloaded/Internal error (HTTP {e.status_code}): {e.message}")
        return False, None
    except APIConnectionError as e:
        print(f"Network connection failed: {e}")
        return False, None
    except APIStatusError as e:
        print(f"API Error (HTTP {e.status_code}): {e.message}")
        return False, None

def probe_latency(model: str = "claude-3-5-haiku-20241022"):
    """Measure single-token ping latency via client.messages.create()."""
    print(f"\n--- 2. Measuring Latency Probe ({model}) ---")
    start = time.perf_counter()
    try:
        response = client.messages.create(
            model=model,
            max_tokens=1,
            messages=[{"role": "user", "content": "ping"}],
        )
        elapsed_ms = (time.perf_counter() - start) * 1000
        print(f"Status: OK (Roundtrip latency: {elapsed_ms:.2f} ms)")
        print(f"Model: {response.model}")
        print(f"Usage: prompt_tokens={response.usage.input_tokens}, completion_tokens={response.usage.output_tokens}")
        return True, elapsed_ms
    except RateLimitError as e:
        print(f"Rate limited (HTTP 429): {e.message}")
        return False, None
    except InternalServerError as e:
        print(f"Server error (HTTP {e.status_code}): {e.message}")
        return False, None
    except APIConnectionError as e:
        print(f"Connection failure: {e}")
        return False, None
    except APIStatusError as e:
        print(f"API Error (HTTP {e.status_code}): {e.message}")
        return False, None

if __name__ == "__main__":
    ok_models, _ = probe_models()
    ok_latency, _ = probe_latency()
    if ok_models and ok_latency:
        print("\nAll connectivity and model probes passed.")
        sys.exit(0)
    else:
        print("\nConnectivity probes encountered errors.")
        sys.exit(1)
