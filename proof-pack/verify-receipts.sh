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

# Cross-run uniqueness: collect all receipt_hash values from receipts dir and
# assert no two receipts share the same hash.
RECEIPT_DIR=".wasm4pm/receipts"
if [[ -d "$RECEIPT_DIR" ]]; then
  mapfile -t all_hashes < <(find "$RECEIPT_DIR" -name "*.json" -exec jq -r '.receipt_hash // empty' {} \; 2>/dev/null | grep -v '^$' | sort)
  if [[ ${#all_hashes[@]} -gt 0 ]]; then
    dupes=$(printf '%s\n' "${all_hashes[@]}" | sort | uniq -d)
    if [[ -n "$dupes" ]]; then
      echo "FAIL: duplicate receipt_hash values detected:" >&2
      echo "$dupes" >&2
      exit 1
    fi
    echo "receipt_hash uniqueness: OK (${#all_hashes[@]} receipts, no duplicates)"
  fi
fi

echo ""
echo "NOTE: model_hash and wasm_hash now emitted by runtime (compute_model_hash in wasm.rs)"
echo ""
echo "=== Receipt verification passed ==="
