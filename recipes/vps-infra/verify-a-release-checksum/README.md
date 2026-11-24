# Verify a Release Archive With SHA-256

Production-ready verification scripts for validating release archives, container payloads, and binary distributions before extraction.

## Files
- `verify.sh`: Production Bash verification script with exit code checking and automatic quarantine isolation.
- `verify.py`: Chunked streaming SHA-256 validator for gigabyte-scale archives (constant 1MB memory footprint).
- `release.sha256.example`: GNU coreutils formatted manifest example.

## Usage

### Bash Verification
```bash
chmod +x verify.sh
./verify.sh app-release-v2.1.0.tar.gz app-release-v2.1.0.tar.gz.sha256
```

### Python Streaming Verification
```bash
python3 verify.py app-release-v2.1.0.tar.gz <expected_sha256_hash>
```

### Manifest Format
```text
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  app-release-v2.1.0.tar.gz
```
