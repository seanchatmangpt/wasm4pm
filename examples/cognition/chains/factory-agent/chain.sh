#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# factory-agent breed chain
# 13 stages: autoinstinct_vision → autoinstinct_semantics → hearsay → mycin
#            → gps → strips → autoinstinct_learning → soar → dendral
#            → prolog → autoinstinct_neurosis → cbr → eliza
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${SCRIPT_DIR%/examples/cognition/chains/factory-agent}"

# Detect wpm binary
if command -v wpm &>/dev/null; then
    WPM="wpm"
elif [ -f "$REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js" ]; then
    WPM="node $REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js"
else
    echo "ERROR: wpm not found in PATH or $REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js" >&2
    exit 1
fi

cd "$SCRIPT_DIR"

# Ensure all result dirs exist
for stage_dir in stages/*/; do
    mkdir -p "$stage_dir"
done

# Stage definitions: "N-dirname breed"
STAGES=(
    "0-autoinstinct_vision autoinstinct_vision"
    "1-autoinstinct_semantics autoinstinct_semantics"
    "2-hearsay hearsay"
    "3-mycin mycin"
    "4-gps gps"
    "5-strips strips"
    "6-autoinstinct_learning autoinstinct_learning"
    "7-soar soar"
    "8-dendral dendral"
    "9-prolog prolog"
    "10-autoinstinct_neurosis autoinstinct_neurosis"
    "11-cbr cbr"
    "12-eliza eliza"
)

TOTAL=${#STAGES[@]}
OK=0
PREV_RESULT=""

for entry in "${STAGES[@]}"; do
    STAGE_DIR_NAME="${entry%% *}"
    BREED="${entry##* }"
    N="${STAGE_DIR_NAME%%-*}"
    STAGE_PATH="stages/$STAGE_DIR_NAME"
    INTENT="$STAGE_PATH/intent.json"
    RESULT="$STAGE_PATH/result.json"
    TRANSFORM="$STAGE_PATH/transform.py"

    # If not stage 0, run transform to produce intent.json from prior result
    if [ "$N" != "0" ]; then
        if [ -z "$PREV_RESULT" ] || [ ! -f "$PREV_RESULT" ]; then
            echo "Stage $N [$BREED]: FAIL (no prior result)" >&2
            exit 1
        fi
        python3 "$TRANSFORM" < "$PREV_RESULT" > "$INTENT"
    fi

    # Run cognition
    if ! $WPM cognition run --contract "$BREED" --input "$INTENT" --format json > "$RESULT" 2>/dev/null; then
        echo "Stage $N [$BREED]: FAIL (wpm exited non-zero)"
        exit 1
    fi

    # Extract output_hash from result — handle both top-level and nested payload
    OUTPUT_HASH=$(python3 -c "
import json, sys
data = json.load(open('$RESULT'))
h = data.get('output_hash', '')
if not h:
    h = data.get('payload', {}).get('output_hash', '')
if not h:
    h = data.get('payload', {}).get('output', {}).get('output_hash', '')
print(h[:16] if h else 'unknown')
")

    STATUS=$(python3 -c "
import json
data = json.load(open('$RESULT'))
s = data.get('status', data.get('payload', {}).get('status', 'unknown'))
print(s)
")

    if [ "$STATUS" = "ok" ] || [ "$STATUS" = "success" ]; then
        echo "Stage $N [$BREED]: ok / hash=$OUTPUT_HASH"
        OK=$((OK + 1))
    else
        echo "Stage $N [$BREED]: FAIL (status=$STATUS)"
        exit 1
    fi

    PREV_RESULT="$RESULT"
done

echo ""
echo "=== Chain complete: $OK/$TOTAL stages ok ==="

if [ "$OK" -ne "$TOTAL" ]; then
    exit 1
fi
