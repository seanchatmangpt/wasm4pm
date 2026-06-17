#!/usr/bin/env bash
# ===========================================================================
# Validate Exported OCEL Conformance
# ===========================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Detect wpm binary
if command -v wpm &>/dev/null; then
    WPM="wpm"
elif [ -f "$REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js" ]; then
    WPM="node $REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js"
else
    echo "ERROR: wpm not found in PATH or $REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js" >&2
    exit 1
fi

OCEL_DIR="$REPO_ROOT/.wasm4pm/ocel/cognition"
MODELS_DIR="$REPO_ROOT/ocel/models/l1"

echo "========================================================"
echo " Validating OCEL Conformance for All Exported Traces"
echo "========================================================"

if [ ! -d "$OCEL_DIR" ]; then
    echo "ERROR: Exported OCEL traces not found at $OCEL_DIR."
    echo "Please run the examples first to generate the traces."
    exit 1
fi

VALIDATED=0
FAILED=0

for ocel_file in "$OCEL_DIR"/*.jsonl; do
    [ -e "$ocel_file" ] || continue
    breed=$(basename "$ocel_file" .jsonl)
    model_file="$MODELS_DIR/${breed}.ocpn.json"

    if [ ! -f "$model_file" ]; then
        # Check if there is a known model name mapping or if it's 'none' in registry
        continue
    fi

    echo "Validating $breed..."
    set +e
    OUTPUT=$($WPM oracle conform "$ocel_file" -m "$model_file" --format json 2>&1)
    EXIT_CODE=$?
    set -e

    if [ $EXIT_CODE -eq 0 ]; then
        echo "  [PASS] $breed conforms to its lifecycle model."
        VALIDATED=$((VALIDATED + 1))
    else
        echo "  [FAIL] $breed failed conformance!"
        echo "$OUTPUT" | jq '.payload.findings' || echo "$OUTPUT"
        FAILED=$((FAILED + 1))
    fi
done

echo ""
echo "========================================================"
echo " Summary: $VALIDATED Passed, $FAILED Failed"
echo "========================================================"

if [ $FAILED -gt 0 ]; then
    exit 1
fi
exit 0
