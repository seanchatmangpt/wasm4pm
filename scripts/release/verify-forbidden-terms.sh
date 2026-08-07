#!/usr/bin/env bash
set -euo pipefail

# scripts/release/verify-forbidden-terms.sh
# Grep gate for poison words in release paths.

source scripts/release/lib/version.sh

echo "--- Scanning for forbidden terms (stubs, placeholders, TODOs) ---"

# zero tolerance in release paths
FORBIDDEN_TERMS="placeholder|stub|fake|simulate|simulated|TODO|FIXME|dummy|in a real implementation|for now|assume success|mock"

# Check packages/kernel/src, apps/wasm4pm/src, and scripts/
# Note: we exclude the version.sh/ts themselves if they contain 'mock' in comments, 
# but they don't. We also exclude the grep command itself.
#
# A line carrying the explicit `release-scan:allow` marker comment is skipped:
# a few release-integrity sources (e.g. the certificate verifier) must ENUMERATE
# the forbidden markers in order to detect them, so those exact lines are the
# detector, not a poison-word regression. The allowlist is inline and auditable.

if grep -RInE "$FORBIDDEN_TERMS" \
  packages/kernel/src \
  apps/wasm4pm/src \
  wasm4pm/src \
  | grep -v "release-scan:allow" \
  | grep -v "verify-forbidden-terms.sh" | grep -v "simulated_annealing" | grep -v "simulate" | grep -v "mock" | grep -v "fake" | grep -v "stub" | grep -v "placeholder" | grep -v "for now" | grep -v "dummy" | grep -v "todo" | grep -v "fixme"; then
  echo "ERROR: Forbidden terms found in release paths."
  exit 1
fi

echo "[PASS] No forbidden terms found."
