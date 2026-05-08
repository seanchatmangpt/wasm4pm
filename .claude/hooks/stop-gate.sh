#!/bin/bash
# Stop Release Gate — Block session end if doctor check fails

set -euo pipefail

cd "$CLAUDE_PROJECT_DIR"

DOCTOR_OUTPUT=$(node apps/wasm4pm/dist/bin/wpm.js doctor check --format json 2>&1 | awk '/^\{/,/^\}/ {print}') || true

HEALTHY=$(echo "$DOCTOR_OUTPUT" | jq -r '.payload.healthy' 2>/dev/null) || HEALTHY=""

if [ "$HEALTHY" != "true" ]; then
  FAIL=$(echo "$DOCTOR_OUTPUT" | jq -r '.payload.summary.fail // "unknown"' 2>/dev/null) || FAIL="unknown"
  echo "ERROR: wpm doctor check failed ($FAIL critical issues) — fix before ending session" >&2
  exit 2
fi

echo '{"stop_allowed": true, "reason": "health_check_passed"}' >&2
exit 0
