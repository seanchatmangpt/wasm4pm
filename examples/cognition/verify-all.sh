#!/usr/bin/env bash
# ===========================================================================
# Master Verification & Replay Determinism Script
# ===========================================================================
set -euo pipefail

export NODE_OPTIONS="--experimental-wasm-modules"


SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Detect wpm binary
if command -v wpm &>/dev/null; then
    WPM="wpm"
elif [ -f "$REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js" ]; then
    WPM="node $REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js"
elif [ -f "$REPO_ROOT/apps/wasm4pm/src/bin/wpm.ts" ]; then
    WPM="npx --prefix $REPO_ROOT tsx $REPO_ROOT/apps/wasm4pm/src/bin/wpm.ts"
else
    echo "ERROR: wpm not found in PATH or $REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js" >&2
    exit 1
fi

BREEDS=(
  "abductive_ibe"
  "abductive_lp"
  "act_r"
  "allen_temporal"
  "analogy_sme"
  "asp"
  "autoinstinct_learning"
  "autoinstinct_neurosis"
  "autoinstinct_semantics"
  "autoinstinct_vision"
  "bayesian_network"
  "belief_merging"
  "cbr"
  "circumscription"
  "clp"
  "construction_grammar"
  "contingent_plan"
  "csp_ac3"
  "ctl_check"
  "default_logic"
  "dempster_shafer"
  "dendral"
  "description_logic"
  "ebl"
  "eliza"
  "episodic_memory"
  "event_calculus"
  "frames_inheritance"
  "fuzzy_logic"
  "gps"
  "hearsay"
  "htn_planning"
  "ilp"
  "ltl_monitor"
  "markov_logic"
  "mdp"
  "meta_reasoning"
  "mycin"
  "naive_physics"
  "partial_order_plan"
  "pomdp"
  "problog"
  "prolog"
  "qualitative_reason"
  "rl_symbolic"
  "sat_cdcl"
  "script_sam"
  "situation_calculus"
  "soar"
  "strips"
  "tableaux"
  "triz"
  "version_space"
  "morphological"
  "ocpm_route_discoverer"
)

echo "========================================================"
echo " Starting Master Cognition Verification & Determinism Audit"
echo "========================================================"
echo "Repo root: $REPO_ROOT"
echo "Total breeds to audit: ${#BREEDS[@]}"
echo "========================================================"
echo ""

# Create a temporary directory for temporary run artifacts
TEMP_DIR=$(mktemp -d -t wpm-verify-XXXXXX)
echo "Created temp directory: $TEMP_DIR"
echo ""

cleanup() {
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

echo "--------------------------------------------------------"
echo " Stage 1: Replay Determinism & Individual Receipt Audits"
echo "--------------------------------------------------------"

for breed in "${BREEDS[@]}"; do
    breed_dir="$REPO_ROOT/examples/cognition/$breed"
    intent_file="$breed_dir/intent.json"
    
    if [ ! -f "$intent_file" ]; then
        echo "ERROR: intent.json missing for breed '$breed' at '$intent_file'" >&2
        exit 1
    fi
    
    echo "Auditing breed '$breed'..."
    
    # Run 1
    run1_out="$TEMP_DIR/${breed}_run1.json"
    if ! $WPM cognition run --contract "$breed" --input "$intent_file" --format json > "$run1_out"; then
        echo "ERROR: Breed '$breed' run 1 failed." >&2
        exit 1
    fi
    
    # Run 2
    run2_out="$TEMP_DIR/${breed}_run2.json"
    if ! $WPM cognition run --contract "$breed" --input "$intent_file" --format json > "$run2_out"; then
        echo "ERROR: Breed '$breed' run 2 failed." >&2
        exit 1
    fi
    
    # Check Replay Determinism
    if ! python3 "$SCRIPT_DIR/verify_helper.py" compare-runs "$run1_out" "$run2_out"; then
        echo "ERROR: Replay determinism failure for breed '$breed'." >&2
        exit 1
    fi
    
    # Extract receipt saved path from run1 output
    receipt_path=$(python3 -c "import json; data=json.load(open('$run1_out')); print(data.get('payload', {}).get('saved_path', ''))")
    if [ -z "$receipt_path" ] || [ ! -f "$receipt_path" ]; then
        echo "ERROR: Receipt file not found at path '$receipt_path' for breed '$breed'" >&2
        exit 1
    fi
    
    # Run receipt verification command
    if ! $WPM cognition verify --receipt "$receipt_path" >/dev/null 2>&1; then
        echo "ERROR: Receipt verification command failed for breed '$breed' receipt '$receipt_path'" >&2
        exit 1
    fi
    
    # Assert there are no empty, placeholder, or fake receipt hashes
    if ! python3 "$SCRIPT_DIR/verify_helper.py" check-receipt "$receipt_path"; then
        echo "ERROR: Receipt check failed for breed '$breed' receipt '$receipt_path'" >&2
        exit 1
    fi
done

echo ""
echo ">>> Stage 1 PASS: All 52 breeds exhibit bit-exact replay determinism and authentic receipts."
echo ""

echo "--------------------------------------------------------"
echo " Stage 2: Running E2E Factory Chain"
echo "--------------------------------------------------------"

CHAIN_SCRIPT="$REPO_ROOT/examples/cognition/chains/factory-agent/chain.sh"
if [ ! -f "$CHAIN_SCRIPT" ]; then
    echo "ERROR: chain.sh missing at '$CHAIN_SCRIPT'" >&2
    exit 1
fi

echo "Executing E2E chain..."
if ! bash "$CHAIN_SCRIPT"; then
    echo "ERROR: E2E factory chain execution failed." >&2
    exit 1
fi

echo ""
echo ">>> Stage 2 PASS: E2E Factory Chain executed successfully."
echo ""

echo "--------------------------------------------------------"
echo " Stage 3: Verifying Cryptographic Chain Linkage"
echo "--------------------------------------------------------"

STAGES_DIR="$REPO_ROOT/examples/cognition/chains/factory-agent/stages"
if ! python3 "$SCRIPT_DIR/verify_helper.py" verify-chain-linkage "$STAGES_DIR"; then
    echo "ERROR: Chain linkage verification failed." >&2
    exit 1
fi

echo ""
echo ">>> Stage 3 PASS: Cryptographic chain linkage verified."
echo ""

echo "--------------------------------------------------------"
echo " Stage 4: Auditing Chain Stage Receipts"
echo "--------------------------------------------------------"

# Find all generated receipt files in the chain directory
CHAIN_RECEIPTS_DIR="$REPO_ROOT/examples/cognition/chains/factory-agent/.wasm4pm/receipts"
if [ ! -d "$CHAIN_RECEIPTS_DIR" ]; then
    echo "ERROR: Chain receipts directory '$CHAIN_RECEIPTS_DIR' does not exist." >&2
    exit 1
fi

echo "Verifying receipts in '$CHAIN_RECEIPTS_DIR'..."
receipts_count=0
for receipt_file in "$CHAIN_RECEIPTS_DIR"/*.json; do
    if [ ! -f "$receipt_file" ]; then
        continue
    fi
    
    # Run receipt verification command
    if ! $WPM cognition verify --receipt "$receipt_file" --ledger-dir "$CHAIN_RECEIPTS_DIR" >/dev/null 2>&1; then
        echo "ERROR: Chain receipt verification command failed for '$receipt_file'" >&2
        exit 1
    fi
    
    # Assert there are no empty, placeholder, or fake receipt hashes
    if ! python3 "$SCRIPT_DIR/verify_helper.py" check-receipt "$receipt_file"; then
        echo "ERROR: Chain receipt check failed for '$receipt_file'" >&2
        exit 1
    fi
    
    receipts_count=$((receipts_count + 1))
done

echo "Successfully verified $receipts_count chain stage receipts."
echo ""
echo ">>> Stage 4 PASS: All chain receipts verified successfully."
echo ""

echo "--------------------------------------------------------"
echo " Stage 5: Auditing Exported OCEL Conformance"
echo "--------------------------------------------------------"

if ! bash "$SCRIPT_DIR/validate-ocel-conformance.sh"; then
    echo "ERROR: OCEL Conformance audit failed." >&2
    exit 1
fi

echo ""
echo ">>> Stage 5 PASS: All exported OCEL traces conform to their lifecycle models."
echo ""

echo "========================================================"
echo " AUDIT COMPLETE WITH OCEL CONFORMANCE: ALL CHECKS PASSED SUCCESSFULLY (Exit 0)"
echo "========================================================"
exit 0
