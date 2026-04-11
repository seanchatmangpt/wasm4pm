#!/bin/bash
# Stop Hook: pictl Doctor Gate
#
# Prevents Claude from stopping if pictl environment has critical failures.
# CRITICAL: Must fail loudly if doctor check fails.

set -e

INPUT=$(cat)

# Check if hook is already active (prevent infinite loop)
HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null)
if [ "$HOOK_ACTIVE" = "true" ]; then
  exit 0  # Allow stop
fi

# Run pictl doctor via make target (must succeed)
DOCTOR_OUTPUT=""
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || {
  echo "ERROR: Cannot change to project directory" >&2
  exit 2
}

# Try make doctor first (most reliable)
if command -v make &>/dev/null && [ -f "Makefile" ]; then
  DOCTOR_OUTPUT=$(make doctor 2>&1) || true
fi

# Fallback to direct node execution if make fails
if [ -z "$DOCTOR_OUTPUT" ] || ! echo "$DOCTOR_OUTPUT" | jq -e '.healthy' >/dev/null 2>&1; then
  if [ -f "apps/pmctl/dist/bin/pmctl.js" ]; then
    DOCTOR_OUTPUT=$(node apps/pmctl/dist/bin/pmctl.js doctor --format json 2>&1 | awk '/^{/,/^}/ {print}') || true
  fi
fi

if [ -z "$DOCTOR_OUTPUT" ]; then
  echo "ERROR: pictl doctor unavailable" >&2
  exit 2  # Block stop
fi

if [ -z "$DOCTOR_OUTPUT" ]; then
  echo "ERROR: pictl doctor returned empty output" >&2
  exit 2  # Block stop
fi

# Parse health status (strict)
HEALTHY=$(echo "$DOCTOR_OUTPUT" | jq -r '.healthy // false' 2>/dev/null)
if [ $? -ne 0 ] || [ -z "$HEALTHY" ]; then
  echo "ERROR: Cannot parse pictl doctor output" >&2
  exit 2
fi

if [ "$HEALTHY" = "true" ]; then
  # Environment is healthy, allow stop
  exit 0
fi

# Environment is degraded, block stop
FAIL=$(echo "$DOCTOR_OUTPUT" | jq -r '.fail // 0')
FAILS=$(echo "$DOCTOR_OUTPUT" | jq -r '.checks[] | select(.status == "fail") | "\(.name): \(.message) (fix: \(.fix))"' 2>/dev/null | head -3 | sed 's/^/  • /')

REASON="pictl doctor: $FAIL critical failure(s) detected
$FAILS

Run: pictl doctor --verbose for full report"

# Block stop with JSON decision (properly escape reason for JSON)
REASON_JSON=$(echo "$REASON" | jq -Rs .)
echo "{\"hookSpecificOutput\":{\"hookEventName\":\"Stop\",\"decision\":\"block\",\"blockReason\":$REASON_JSON}}"
exit 0
