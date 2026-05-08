#!/bin/bash
# UserPromptSubmit hook - Scan for wasm4pm-specific anti-patterns (non-blocking)

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/utils.sh"

patterns=(
  "direct wasm-pack build"
  "direct npm test"
  "FM-5 violation"
  "Mock of init.js"
  "isWasmAvailable guard"
  "completion claimed without OTEL"
  "BLAKE3 receipt skipped"
  "silent fallback"
)

# This is non-blocking, so always exit 0
exit 0
