import os
import sys
from dotenv import load_dotenv
from anthropic import Anthropic, APIConnectionError, APIStatusError

load_dotenv()

api_key = os.getenv("ANTHROPIC_API_KEY")
if not api_key:
    print("FATAL: ANTHROPIC_API_KEY is not set in the environment.", file=sys.stderr)
    sys.exit(1)

client = Anthropic(api_key=api_key)

try:
    response = client.messages.create(
        model="claude-3-5-sonnet-20241022",
        max_tokens=64,
        messages=[
            {"role": "user", "content": "Respond with the word PING."}
        ]
    )
    output_text = response.content[0].text.strip()
    print(f"Python SDK Verified: {output_text} (Model: {response.model})")
except APIConnectionError as e:
    print(f"Network failure reaching Anthropic API: {e.__cause__}", file=sys.stderr)
    sys.exit(1)
except APIStatusError as e:
    print(f"API HTTP status error [{e.status_code}]: {e.response}", file=sys.stderr)
    sys.exit(1)
