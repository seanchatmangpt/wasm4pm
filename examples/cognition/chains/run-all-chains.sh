#!/usr/bin/env bash
# run-all-chains.sh — Master runner for all breed chain case studies
# Runs: socratic-diagnosis (7), scientific-discovery (6), factory-agent (13)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CHAINS=(
  "socratic-diagnosis"
  "scientific-discovery"
  "factory-agent"
)

PASSED=0
FAILED=0
declare -A CHAIN_STATUS

echo "========================================================"
echo " wasm4pm Breed Chain Runner"
echo " $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "========================================================"
echo ""

for chain in "${CHAINS[@]}"; do
  CHAIN_SCRIPT="${SCRIPT_DIR}/${chain}/chain.sh"

  if [[ ! -f "${CHAIN_SCRIPT}" ]]; then
    echo "ERROR: chain.sh not found: ${CHAIN_SCRIPT}" >&2
    CHAIN_STATUS["${chain}"]="FAIL (chain.sh missing)"
    FAILED=$((FAILED + 1))
    continue
  fi

  echo "--------------------------------------------------------"
  echo " Chain: ${chain}"
  echo "--------------------------------------------------------"

  CHAIN_EXIT=0
  bash "${CHAIN_SCRIPT}" || CHAIN_EXIT=$?

  if [[ "${CHAIN_EXIT}" -eq 0 ]]; then
    CHAIN_STATUS["${chain}"]="PASS"
    PASSED=$((PASSED + 1))
    echo ""
    echo "  [${chain}] PASS"
  else
    CHAIN_STATUS["${chain}"]="FAIL (exit ${CHAIN_EXIT})"
    FAILED=$((FAILED + 1))
    echo ""
    echo "  [${chain}] FAIL (exit ${CHAIN_EXIT})" >&2
  fi
  echo ""
done

echo "========================================================"
echo " Summary"
echo "========================================================"
for chain in "${CHAINS[@]}"; do
  printf "  %-30s %s\n" "${chain}" "${CHAIN_STATUS[${chain}]:-SKIP}"
done
echo ""
echo "  Total: ${PASSED} passed, ${FAILED} failed"
echo "========================================================"

if [[ "${FAILED}" -gt 0 ]]; then
  exit 1
fi
exit 0
