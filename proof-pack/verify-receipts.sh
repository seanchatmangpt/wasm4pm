#!/usr/bin/env bash
set -euo pipefail

RECEIPT=".wasm4pm/receipts/latest.json"

if [[ ! -f "$RECEIPT" ]]; then
  echo "ERROR: $RECEIPT not found. Run wpm first to generate a receipt." >&2
  exit 1
fi

echo "=== Receipt Verification ==="

input_hash=$(jq -r '.input_hash // empty' "$RECEIPT")
output_hash=$(jq -r '.output_hash // empty' "$RECEIPT")

if [[ -z "$input_hash" ]]; then
  echo "FAIL: input_hash is empty or missing" >&2
  exit 1
fi

if [[ -z "$output_hash" ]]; then
  echo "FAIL: output_hash is empty or missing" >&2
  exit 1
fi

echo "input_hash:  $input_hash"
echo "output_hash: $output_hash"

echo ""
echo "NOTE: ocel_hash, model_hash, wasm_hash — PENDING (not yet emitted by runtime)"
echo ""
echo "=== Receipt verification passed ==="
