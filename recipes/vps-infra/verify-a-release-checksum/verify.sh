#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_FILE="${1:-app-release-v2.1.0.tar.gz}"
MANIFEST_FILE="${2:-${ARCHIVE_FILE}.sha256}"
QUARANTINE_DIR="${QUARANTINE_DIR:-/tmp/quarantine}"
TARGET_EXTRACT_DIR="${TARGET_EXTRACT_DIR:-/opt/services/app}"

echo "Running cryptographic verification on ${ARCHIVE_FILE}..."

if [ ! -f "${ARCHIVE_FILE}" ] || [ ! -f "${MANIFEST_FILE}" ]; then
    echo "Error: Required payload or manifest file missing." >&2
    exit 2
fi

# Run coreutils verification using process exit code
if sha256sum --check "${MANIFEST_FILE}" --status; then
    echo "Integrity check passed. Proceeding with deployment."
    mkdir -p "${TARGET_EXTRACT_DIR}"
    tar -xzf "${ARCHIVE_FILE}" -C "${TARGET_EXTRACT_DIR}"
    echo "Extraction complete."
else
    echo "CRITICAL: Checksum verification failed for ${ARCHIVE_FILE}!" >&2
    mkdir -p "${QUARANTINE_DIR}"
    TIMESTAMP=$(date -u +"%Y%m%d_%H%M%SZ")
    mv "${ARCHIVE_FILE}" "${QUARANTINE_DIR}/${ARCHIVE_FILE}.corrupt_${TIMESTAMP}"
    echo "Corrupt archive moved to quarantine: ${QUARANTINE_DIR}/${ARCHIVE_FILE}.corrupt_${TIMESTAMP}" >&2
    exit 1
fi
