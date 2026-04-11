#!/bin/bash
# SessionStart Hook: pictl Environment Briefing
#
# Runs `pictl doctor` and injects health summary into Claude's context.
# CRITICAL: Must succeed. Fails loudly if doctor is unavailable.

set -e

DOCTOR_OUTPUT=""

# Try to run pictl doctor in priority order
if command -v pictl &>/dev/null; then
  DOCTOR_OUTPUT=$(pictl doctor --format json)
elif [ -f "$CLAUDE_PROJECT_DIR/apps/pmctl/dist/cli.js" ]; then
  DOCTOR_OUTPUT=$(node "$CLAUDE_PROJECT_DIR/apps/pmctl/dist/cli.js" doctor --format json)
else
  echo "ERROR: pictl doctor unavailable — cannot check environment health" >&2
  echo "  PICTL_ERROR: Neither 'pictl' nor dist/cli.js found"
  exit 1
fi

if [ -z "$DOCTOR_OUTPUT" ]; then
  echo "ERROR: pictl doctor returned empty output" >&2
  exit 1
fi

# Parse the report with jq (strict — must succeed)
HEALTHY=$(echo "$DOCTOR_OUTPUT" | jq -r '.healthy' 2>/dev/null)
if [ $? -ne 0 ] || [ -z "$HEALTHY" ]; then
  echo "ERROR: Cannot parse pictl doctor output" >&2
  echo "$DOCTOR_OUTPUT" >&2
  exit 1
fi

OK=$(echo "$DOCTOR_OUTPUT" | jq -r '.ok // 0')
WARN=$(echo "$DOCTOR_OUTPUT" | jq -r '.warn // 0')
FAIL=$(echo "$DOCTOR_OUTPUT" | jq -r '.fail // 0')

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
