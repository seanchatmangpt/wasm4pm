#!/usr/bin/env bash
# cognition-replay-cycle.sh — Runs a complete decision cycle per architecture diagrams #34-35.
# Pipeline: run → receipt → replay → verify (byte-identical combined_hash).
#
# Exit codes:
#   0 — Cycle completed; hashes match (deterministic)
#   3 — Hash drift detected or step failed
#
# Usage:
#   bash crates/wasm4pm-cognition/scripts/cognition-replay-cycle.sh
#   bash crates/wasm4pm-cognition/scripts/cognition-replay-cycle.sh --contract eliza
#   bash crates/wasm4pm-cognition/scripts/cognition-replay-cycle.sh --contract eliza --input path/to/intent.json

set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

# Parse flags
CONTRACT="${CONTRACT:-eliza}"
INPUT_FILE="${INPUT_FILE:-}"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --contract) CONTRACT="$2"; shift 2 ;;
        --input)    INPUT_FILE="$2"; shift 2 ;;
        *) shift ;;
    esac
done

# Resolve default input if not provided
if [ -z "$INPUT_FILE" ]; then
    DEFAULT_INPUT="examples/cognition/${CONTRACT}/intent.json"
    if [ -f "$DEFAULT_INPUT" ]; then
        INPUT_FILE="$DEFAULT_INPUT"
    else
        # Fall back to a minimal inline input written to a temp file
        INPUT_FILE="$(mktemp /tmp/cognition-replay-XXXXXX.json)"
        cat > "$INPUT_FILE" <<'INTENT_JSON'
{
  "contract": "eliza",
  "query": "What process should I follow?",
  "context": {}
}
INTENT_JSON
        TEMP_INPUT="$INPUT_FILE"
    fi
fi

# Verify wpm CLI is available
WPM_BIN=""
if command -v wpm >/dev/null 2>&1; then
    WPM_BIN="wpm"
elif [ -f "$ROOT/apps/wasm4pm/dist/bin/wpm.js" ]; then
    WPM_BIN="node $ROOT/apps/wasm4pm/dist/bin/wpm.js"
elif [ -f "$ROOT/apps/wasm4pm/dist/index.js" ]; then
    WPM_BIN="node $ROOT/apps/wasm4pm/dist/index.js"
else
    echo "FAIL: wpm binary not found. Run 'cd apps/wasm4pm && pnpm build' first."
    exit 3
fi

echo "=== Cognition Replay Cycle ==="
echo "    Contract:   $CONTRACT"
echo "    Input:      $INPUT_FILE"
echo "    CLI:        $WPM_BIN"
echo

# ── Step 1: Run cognition → produce receipt ───────────────────────────────────
echo "[1/4] Run cognition (contract=$CONTRACT)..."
RUN_OUTPUT=$($WPM_BIN cognition run \
    --contract "$CONTRACT" \
    --input "$INPUT_FILE" \
    --format json 2>&1) || {
    echo "      FAIL: cognition run exited non-zero"
    echo "      Output: $RUN_OUTPUT"
    exit 3
}

RECEIPT_ID=$(echo "$RUN_OUTPUT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
# Try nested paths: payload.receipt.run_id, receipt.run_id, run_id
for path in [['payload','receipt','run_id'], ['receipt','run_id'], ['run_id']]:
    obj = data
    try:
        for key in path:
            obj = obj[key]
        print(obj)
        sys.exit(0)
    except (KeyError, TypeError):
        pass
sys.exit(1)
" 2>/dev/null) || {
    echo "      FAIL: could not extract run_id from output"
    echo "      Raw output: $RUN_OUTPUT"
    exit 3
}

echo "      Receipt ID: $RECEIPT_ID"

# ── Step 2: Fetch original combined_hash ─────────────────────────────────────
echo "[2/4] Fetch original receipt (run_id=$RECEIPT_ID)..."
RECEIPT_OUTPUT=$($WPM_BIN cognition receipt \
    --receipt-id "$RECEIPT_ID" \
    --format json 2>&1) || {
    echo "      FAIL: cognition receipt exited non-zero"
    echo "      Output: $RECEIPT_OUTPUT"
    exit 3
}

ORIG_HASH=$(echo "$RECEIPT_OUTPUT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for path in [['payload','receipt','combined_hash'], ['receipt','combined_hash'], ['combined_hash']]:
    obj = data
    try:
        for key in path:
            obj = obj[key]
        print(obj)
        sys.exit(0)
    except (KeyError, TypeError):
        pass
sys.exit(1)
" 2>/dev/null) || {
    echo "      FAIL: could not extract combined_hash from receipt"
    echo "      Raw output: $RECEIPT_OUTPUT"
    exit 3
}

echo "      Original combined_hash: $ORIG_HASH"

# ── Step 3: Replay ───────────────────────────────────────────────────────────
echo "[3/4] Replay (receipt_id=$RECEIPT_ID)..."
REPLAY_OUTPUT=$($WPM_BIN cognition replay \
    --receipt-id "$RECEIPT_ID" \
    --format json 2>&1) || {
    echo "      FAIL: cognition replay exited non-zero"
    echo "      Output: $REPLAY_OUTPUT"
    exit 3
}

REPLAY_HASH=$(echo "$REPLAY_OUTPUT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for path in [['payload','replayed','combined_hash'], ['replayed','combined_hash'], ['combined_hash']]:
    obj = data
    try:
        for key in path:
            obj = obj[key]
        print(obj)
        sys.exit(0)
    except (KeyError, TypeError):
        pass
sys.exit(1)
" 2>/dev/null) || {
    echo "      FAIL: could not extract combined_hash from replay output"
    echo "      Raw output: $REPLAY_OUTPUT"
    exit 3
}

echo "      Replayed combined_hash: $REPLAY_HASH"

# ── Step 4: Verify byte-identical hashes ─────────────────────────────────────
echo "[4/4] Verify determinism (orig == replay)..."
if [ "$ORIG_HASH" = "$REPLAY_HASH" ]; then
    echo "      DETERMINISTIC: hashes match ($ORIG_HASH)"
else
    echo "      DRIFT DETECTED:"
    echo "        Original: $ORIG_HASH"
    echo "        Replayed: $REPLAY_HASH"
    # Cleanup temp file if created
    [ -n "${TEMP_INPUT:-}" ] && rm -f "$TEMP_INPUT"
    exit 3
fi

# ── Step 5: Adversarial gate verify ──────────────────────────────────────────
echo
echo "[5/5] Adversarial gate verify (receipt_id=$RECEIPT_ID)..."
VERIFY_OUTPUT=$($WPM_BIN cognition verify \
    --receipt-id "$RECEIPT_ID" \
    --format json 2>&1) || {
    echo "      FAIL: cognition verify exited non-zero"
    echo "      Output: $VERIFY_OUTPUT"
    # Cleanup temp file if created
    [ -n "${TEMP_INPUT:-}" ] && rm -f "$TEMP_INPUT"
    exit 3
}
echo "      Adversarial gate: PASSED"

# Cleanup temp file if created
[ -n "${TEMP_INPUT:-}" ] && rm -f "$TEMP_INPUT"

echo
echo "=== Cognition Replay Cycle: COMPLETE ==="
echo "    run_id:        $RECEIPT_ID"
echo "    combined_hash: $ORIG_HASH"
echo "    Deterministic: YES"
