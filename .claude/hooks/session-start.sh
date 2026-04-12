#!/bin/bash
# SessionStart Hook: pictl Environment Briefing
#
# Runs `pictl doctor` and injects health summary into Claude's context.
# CRITICAL: Must succeed. Fails loudly if doctor is unavailable.

set -e

DOCTOR_OUTPUT=""

# Run pictl doctor via make target (builds CLI if needed)
cd "$CLAUDE_PROJECT_DIR"
DOCTOR_OUTPUT=$(make doctor 2>&1) || true

# If output contains error or is empty, try direct node execution
if [ -z "$DOCTOR_OUTPUT" ]; then
  # Try fallback: direct node execution without make
  if [ -f "apps/pmctl/dist/bin/pmctl.js" ]; then
    DOCTOR_OUTPUT=$(node apps/pmctl/dist/bin/pmctl.js doctor --format json 2>&1 | awk '/^{/,/^}/ {print}') || true
  fi
elif ! echo "$DOCTOR_OUTPUT" | jq -e '.healthy' >/dev/null 2>&1; then
  # JSON is invalid, try fallback
  if [ -f "apps/pmctl/dist/bin/pmctl.js" ]; then
    DOCTOR_OUTPUT=$(node apps/pmctl/dist/bin/pmctl.js doctor --format json 2>&1 | awk '/^{/,/^}/ {print}') || true
  fi
fi

if [ -z "$DOCTOR_OUTPUT" ]; then
  echo "ERROR: pictl doctor returned empty output" >&2
  exit 1
fi

# Parse the report with jq (strict — must succeed)
HEALTHY=$(echo "$DOCTOR_OUTPUT" | jq -r '.healthy' 2>/dev/null) || {
  echo "ERROR: Cannot parse pictl doctor output" >&2
  exit 1
}

if [ -z "$HEALTHY" ]; then
  echo "ERROR: Cannot parse pictl doctor output" >&2
  exit 1
fi

OK=$(echo "$DOCTOR_OUTPUT" | jq -r '.ok // 0' 2>/dev/null) || OK="0"
WARN=$(echo "$DOCTOR_OUTPUT" | jq -r '.warn // 0' 2>/dev/null) || WARN="0"
FAIL=$(echo "$DOCTOR_OUTPUT" | jq -r '.fail // 0' 2>/dev/null) || FAIL="0"

# Output health status
if [ "$HEALTHY" = "true" ]; then
  echo "✓ pictl environment: HEALTHY ($OK ok, $WARN warn, 0 fail)"
else
  echo "✗ pictl environment: DEGRADED ($OK ok, $WARN warn, $FAIL fail)"
  echo ""
  echo "Critical failures:"
  echo "$DOCTOR_OUTPUT" | jq -r '.checks[] | select(.status == "fail") | "  • \(.name): \(.message)\n    Fix: \(.fix)"'
fi

# Report checkpoint status if available
if [ -f "$CLAUDE_PROJECT_DIR/.pictl/checkpoint" ]; then
  CHECKPOINT=$(cat "$CLAUDE_PROJECT_DIR/.pictl/checkpoint" | jq -r '.progress | "\(.processed)/\(.total)"' 2>/dev/null)
  TIMESTAMP=$(cat "$CLAUDE_PROJECT_DIR/.pictl/checkpoint" | jq -r '.timestamp' 2>/dev/null)
  if [ -n "$CHECKPOINT" ] && [ -n "$TIMESTAMP" ]; then
    echo "  Checkpoint: $CHECKPOINT traces processed (last: $TIMESTAMP)"
  fi
fi

exit 0
