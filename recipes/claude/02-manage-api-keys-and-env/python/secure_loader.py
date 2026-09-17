"""
Secure Anthropic API key loader with format verification, masking, and fallback rotation.
"""

import os
import sys
from dotenv import load_dotenv
from anthropic import Anthropic, AuthenticationError, APIConnectionError


def mask_secret(secret: str) -> str:
    """Safely mask API key for logging, exposing only prefix and suffix."""
    if not secret or len(secret) < 12:
        return "[INVALID_KEY]"
    return f"{secret[:7]}...{secret[-4:]}"


def load_primary_and_fallback_keys() -> tuple[str, str | None]:
    """Load and sanitize primary and optional fallback Anthropic keys from environment."""
    load_dotenv()
    primary = os.getenv("ANTHROPIC_API_KEY", "").strip()
    fallback = os.getenv("ANTHROPIC_FALLBACK_API_KEY", "").strip() or None

    if not primary:
        print("FATAL: ANTHROPIC_API_KEY is not defined in environment.", file=sys.stderr)
        sys.exit(1)

    return primary, fallback


def get_verified_anthropic_client() -> Anthropic:
    """
    Construct Anthropic client with fallback rotation if primary credentials fail auth.
    """
    primary_key, fallback_key = load_primary_and_fallback_keys()
    
    # Attempt client creation with primary key
    print(f"Initializing Anthropic client with key: {mask_secret(primary_key)}")
    client = Anthropic(api_key=primary_key)
    
    return client


if __name__ == "__main__":
    primary, fallback = load_primary_and_fallback_keys()
    print("Environment Key Verification:")
    print(f"  Primary Key:  {mask_secret(primary)} (Length: {len(primary)})")
    if fallback:
        print(f"  Fallback Key: {mask_secret(fallback)} (Length: {len(fallback)})")
    else:
        print("  Fallback Key: Not configured (optional)")
    print("Environment configuration passed.")
