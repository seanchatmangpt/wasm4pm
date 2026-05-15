#!/usr/bin/env bash
# generate-substrate-cert.sh — generate substrate-certificate.json
# Reads capability-matrix.json + real-data-report.json + fake-stub-audit.json
set -euo pipefail

cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

VERSION=$(grep '^version' wasm4pm/Cargo.toml | head -1 | sed 's/.*"\(.*\)".*/\1/')
CERT_DIR="wasm4pm/target/wasm4pm-v${VERSION}"

REAL_DATA_REPORT="${REAL_DATA_REPORT:-${CERT_DIR}/real-data-report.json}"
FAKE_AUDIT="${FAKE_AUDIT:-${CERT_DIR}/fake-stub-audit.json}"
OUTPUT_FILE="${CERT_DIR}/substrate-certificate.json"

REAL_DATA_REPORT="$REAL_DATA_REPORT" \
FAKE_AUDIT="$FAKE_AUDIT" \
OUTPUT_FILE="$OUTPUT_FILE" \
RELEASE="$VERSION" \
bash scripts/substrate-cert.sh
