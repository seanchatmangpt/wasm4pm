#!/usr/bin/env bash
# chain.sh — scientific-discovery breed chain orchestrator
# Runs 6 cognition stages: hearsay -> dendral -> prolog -> autoinstinct_vision
#                          -> autoinstinct_learning -> soar
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../../" && pwd)"

# ---------------------------------------------------------------------------
# Detect wpm binary
# ---------------------------------------------------------------------------
if command -v wpm &>/dev/null; then
  WPM="wpm"
elif [[ -f "${REPO_ROOT}/apps/wasm4pm/dist/bin/wpm.js" ]]; then
  WPM="node ${REPO_ROOT}/apps/wasm4pm/dist/bin/wpm.js"
else
  echo "ERROR: wpm not found in PATH or at ${REPO_ROOT}/apps/wasm4pm/dist/bin/wpm.js" >&2
  exit 1
fi

echo "Using wpm: ${WPM}"
echo ""

# ---------------------------------------------------------------------------
# Stage definitions: (index, breed_dir, breed_name)
# ---------------------------------------------------------------------------
STAGES=(
  "0:0-hearsay:hearsay"
  "1:1-dendral:dendral"
  "2:2-prolog:prolog"
  "3:3-autoinstinct_vision:autoinstinct_vision"
  "4:4-autoinstinct_learning:autoinstinct_learning"
  "5:5-soar:soar"
)

STAGES_OK=0
STAGES_TOTAL=${#STAGES[@]}

# ---------------------------------------------------------------------------
# Run each stage
# ---------------------------------------------------------------------------
for entry in "${STAGES[@]}"; do
  IDX="${entry%%:*}"
  REST="${entry#*:}"
  DIR="${REST%%:*}"
  BREED="${REST#*:}"

  STAGE_DIR="${SCRIPT_DIR}/stages/${DIR}"
  INTENT_JSON="${STAGE_DIR}/intent.json"
  RESULT_JSON="${STAGE_DIR}/result.json"
  TRANSFORM_PY="${STAGE_DIR}/transform.py"

  mkdir -p "${STAGE_DIR}"

  # If not stage 0, run the transformer to produce this stage's intent.json
  # from the previous stage's result.json
  if [[ "${IDX}" -gt 0 ]]; then
    PREV_IDX=$(( IDX - 1 ))
    PREV_DIR="${STAGES[$PREV_IDX]}"
    PREV_STAGE_DIR_NAME="${PREV_DIR#*:}"
    PREV_STAGE_DIR_NAME="${PREV_STAGE_DIR_NAME%%:*}"
    PREV_RESULT="${SCRIPT_DIR}/stages/${PREV_STAGE_DIR_NAME}/result.json"

    if [[ ! -f "${PREV_RESULT}" ]]; then
      echo "ERROR: Previous result not found: ${PREV_RESULT}" >&2
      exit 1
    fi

    if [[ ! -f "${TRANSFORM_PY}" ]]; then
      echo "ERROR: Transform script not found: ${TRANSFORM_PY}" >&2
      exit 1
    fi

    echo "  [transform] Stage ${IDX} (${BREED}): running transform.py ..."
    python3 "${TRANSFORM_PY}" < "${PREV_RESULT}" > "${INTENT_JSON}"
  fi

  if [[ ! -f "${INTENT_JSON}" ]]; then
    echo "ERROR: intent.json not found: ${INTENT_JSON}" >&2
    exit 1
  fi

  # Run the cognition stage
  echo "  [run] Stage ${IDX} (${BREED}): wpm cognition run ..."
  set +e
  RAW_OUTPUT=$(${WPM} cognition run --contract "${BREED}" --input "${INTENT_JSON}" --format json 2>&1)
  EXIT_CODE=$?
  set -e

  if [[ ${EXIT_CODE} -ne 0 ]]; then
    echo "Stage ${IDX} [${BREED}]: FAILED (exit ${EXIT_CODE})"
    echo "  Output: ${RAW_OUTPUT}" | head -20
    exit 1
  fi

  # Save result.json
  echo "${RAW_OUTPUT}" > "${RESULT_JSON}"

  # Extract output_hash for display (handle both direct and payload-wrapped responses)
  OUTPUT_HASH=$(echo "${RAW_OUTPUT}" | python3 -c "
import json, sys
data = json.load(sys.stdin)
oh = (data.get('output_hash')
      or data.get('payload', {}).get('output_hash')
      or data.get('data', {}).get('output_hash')
      or '')
print(oh[:16] if oh else 'unknown')
" 2>/dev/null || echo "unknown")

  echo "Stage ${IDX} [${BREED}]: ok / hash=${OUTPUT_HASH}"
  STAGES_OK=$(( STAGES_OK + 1 ))
done

echo ""
echo "=== Chain complete: ${STAGES_OK}/${STAGES_TOTAL} stages ok ==="
