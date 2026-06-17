#!/usr/bin/env bash
set -euo pipefail

export NODE_OPTIONS="--experimental-wasm-modules"


# ---------------------------------------------------------------------------
# factory-agent breed chain
# 52 stages: abductive_ibe → ... → version_space
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

# Stage definitions: "NN-dirname breed"
STAGES=(
    "00-abductive_ibe abductive_ibe"
    "01-abductive_lp abductive_lp"
    "02-act_r act_r"
    "03-allen_temporal allen_temporal"
    "04-analogy_sme analogy_sme"
    "05-asp asp"
    "06-autoinstinct_learning autoinstinct_learning"
    "07-autoinstinct_neurosis autoinstinct_neurosis"
    "08-autoinstinct_semantics autoinstinct_semantics"
    "09-autoinstinct_vision autoinstinct_vision"
    "10-bayesian_network bayesian_network"
    "11-belief_merging belief_merging"
    "12-cbr cbr"
    "13-circumscription circumscription"
    "14-clp clp"
    "15-construction_grammar construction_grammar"
    "16-contingent_plan contingent_plan"
    "17-csp_ac3 csp_ac3"
    "18-ctl_check ctl_check"
    "19-default_logic default_logic"
    "20-dempster_shafer dempster_shafer"
    "21-dendral dendral"
    "22-description_logic description_logic"
    "23-ebl ebl"
    "24-eliza eliza"
    "25-episodic_memory episodic_memory"
    "26-event_calculus event_calculus"
    "27-frames_inheritance frames_inheritance"
    "28-fuzzy_logic fuzzy_logic"
    "29-gps gps"
    "30-hearsay hearsay"
    "31-htn_planning htn_planning"
    "32-ilp ilp"
    "33-ltl_monitor ltl_monitor"
    "34-markov_logic markov_logic"
    "35-mdp mdp"
    "36-meta_reasoning meta_reasoning"
    "37-mycin mycin"
    "38-naive_physics naive_physics"
    "39-partial_order_plan partial_order_plan"
    "40-pomdp pomdp"
    "41-problog problog"
    "42-prolog prolog"
    "43-qualitative_reason qualitative_reason"
    "44-rl_symbolic rl_symbolic"
    "45-sat_cdcl sat_cdcl"
    "46-script_sam script_sam"
    "47-situation_calculus situation_calculus"
    "48-soar soar"
    "49-strips strips"
    "50-tableaux tableaux"
    "51-version_space version_space"
    "52-morphological morphological"
    "53-triz triz"
    "54-ocpm_route_discoverer ocpm_route_discoverer"
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

    # If not stage 00, run transform to produce intent.json from prior result
    if [ "$N" != "00" ]; then
        if [ -z "$PREV_RESULT" ] || [ ! -f "$PREV_RESULT" ]; then
            echo "Stage $N [$BREED]: FAIL (no prior result)" >&2
            exit 1
        fi
        python3 "$TRANSFORM" < "$PREV_RESULT" > "$INTENT"
    fi

    # Run cognition
    if ! $WPM cognition run --contract "$BREED" --input "$INTENT" --format json > "$RESULT"; then
        echo "Stage $N [$BREED]: FAIL (wpm exited non-zero)" >&2
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
        echo "Stage $N [$BREED]: FAIL (status=$STATUS)" >&2
        exit 1
    fi

    PREV_RESULT="$RESULT"
done

echo ""
echo "=== Chain complete: $OK/$TOTAL stages ok ==="

if [ "$OK" -ne "$TOTAL" ]; then
    exit 1
fi
