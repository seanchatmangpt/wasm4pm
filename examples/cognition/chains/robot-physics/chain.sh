#!/usr/bin/env bash
# chain.sh — robot-physics breed chain orchestrator
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../../" && pwd)"

# Detect wpm binary
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

STAGES=(
  "0:0-event_calculus:event_calculus"
  "1:1-naive_physics:naive_physics"
  "2:2-qualitative_reason:qualitative_reason"
  "3:3-mdp:mdp"
  "4:4-rl_symbolic:rl_symbolic"
  "5:5-contingent_plan:contingent_plan"
)

STAGES_OK=0
STAGES_TOTAL=${#STAGES[@]}

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

  echo "${RAW_OUTPUT}" > "${RESULT_JSON}"

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
