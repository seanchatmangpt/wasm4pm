#!/usr/bin/env bash
# run-all-chains.sh — Master runner for all breed chain case studies
# Runs all 10 chains covering the 55 breeds.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CHAINS=(
  "socratic-diagnosis"
  "scientific-discovery"
  "factory-agent"
  "smart-home"
  "medical-diagnosis"
  "robot-physics"
  "legal-policy"
  "cognitive-memory"
  "system-verification"
  "meta-nlp"
)

PASSED=0
FAILED=0
CHAIN_LOG=""

echo "========================================================"
echo " wasm4pm Breed Chain Runner"
echo " $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "========================================================"
echo ""

for chain in "${CHAINS[@]}"; do
  CHAIN_SCRIPT="${SCRIPT_DIR}/${chain}/chain.sh"

  if [[ ! -f "${CHAIN_SCRIPT}" ]]; then
    echo "ERROR: chain.sh not found: ${CHAIN_SCRIPT}" >&2
    CHAIN_LOG="${CHAIN_LOG}  ${chain} : FAIL (chain.sh missing)\n"
    FAILED=$((FAILED + 1))
    continue
  fi

  echo "--------------------------------------------------------"
  echo " Chain: ${chain}"
  echo "--------------------------------------------------------"

  CHAIN_EXIT=0
  bash "${CHAIN_SCRIPT}" || CHAIN_EXIT=$?

  if [[ "${CHAIN_EXIT}" -eq 0 ]]; then
    CHAIN_LOG="${CHAIN_LOG}  ${chain} : PASS\n"
    PASSED=$((PASSED + 1))
    echo ""
    echo "  [${chain}] PASS"
  else
    CHAIN_LOG="${CHAIN_LOG}  ${chain} : FAIL (exit ${CHAIN_EXIT})\n"
    FAILED=$((FAILED + 1))
    echo ""
    echo "  [${chain}] FAIL (exit ${CHAIN_EXIT})" >&2
  fi
  echo ""
done

echo "========================================================"
echo " Summary"
echo "========================================================"
echo -e "$CHAIN_LOG"
echo ""
echo "  Total: ${PASSED} passed, ${FAILED} failed"
echo "========================================================"

if [[ "${FAILED}" -gt 0 ]]; then
  exit 1
fi
exit 0
