#!/usr/bin/env python3
"""Streaming SHA-256 archive verifier for large deployment payloads."""

import hashlib
import sys
from pathlib import Path

def verify_file_sha256(file_path: Path, expected_hash: str, chunk_size: int = 1024 * 1024) -> bool:
    """Compute SHA-256 using 1MB chunks and compare against expected hex digest."""
    sha256 = hashlib.sha256()
    
    with open(file_path, "rb") as f:
        while chunk := f.read(chunk_size):
            sha256.update(chunk)
            
    computed = sha256.hexdigest().lower()
    expected = expected_hash.strip().lower()
    
    if computed == expected:
        print(f"PASS: {file_path.name} matches expected digest.")
        return True
    else:
        print(f"FAIL: {file_path.name} digest mismatch!", file=sys.stderr)
        print(f"  Computed: {computed}", file=sys.stderr)
        print(f"  Expected: {expected}", file=sys.stderr)
        return False

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 verify.py <archive_path> <expected_sha256>")
        sys.exit(2)
        
    target_file = Path(sys.argv[1])
    expected_digest = sys.argv[2]
    
    if not target_file.is_file():
        print(f"Error: Target file {target_file} does not exist.", file=sys.stderr)
        sys.exit(2)
        
    success = verify_file_sha256(target_file, expected_digest)
    sys.exit(0 if success else 1)
