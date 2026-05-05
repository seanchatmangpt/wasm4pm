#!/bin/bash
# SessionStart Hook: wasm4pm (wpm) Environment Briefing
#
# Runs `wpm doctor` and injects health summary into Claude's context.
# CRITICAL: Must succeed. Fails loudly if doctor is unavailable.

set -e

DOCTOR_OUTPUT=""

# Run wpm doctor via make target (builds CLI if needed)
cd "$CLAUDE_PROJECT_DIR"
DOCTOR_OUTPUT=$(make doctor 2>&1) || true

# If output contains error or is empty, try direct node execution
if [ -z "$DOCTOR_OUTPUT" ]; then
  # Try fallback: direct node execution without make
  if [ -f "apps/wasm4pm/dist/bin/wpm.js" ]; then
    DOCTOR_OUTPUT=$(node apps/wasm4pm/dist/bin/wpm.js doctor --format json 2>&1 | awk '/^{/,/^}/ {print}') || true
  fi
elif ! echo "$DOCTOR_OUTPUT" | jq -e '.healthy' >/dev/null 2>&1; then
  # JSON is invalid, try fallback
  if [ -f "apps/wasm4pm/dist/bin/wpm.js" ]; then
    DOCTOR_OUTPUT=$(node apps/wasm4pm/dist/bin/wpm.js doctor --format json 2>&1 | awk '/^{/,/^}/ {print}') || true
  fi
fi

if [ -z "$DOCTOR_OUTPUT" ]; then
  echo "ERROR: wpm doctor returned empty output" >&2
  exit 1
fi

# Parse the report with jq (strict — must succeed)
HEALTHY=$(echo "$DOCTOR_OUTPUT" | jq -r '.healthy' 2>/dev/null) || {
  echo "ERROR: Cannot parse wpm doctor output" >&2
  exit 1
}

if [ -z "$HEALTHY" ]; then
  echo "ERROR: Cannot parse wpm doctor output" >&2
  exit 1
fi

OK=$(echo "$DOCTOR_OUTPUT" | jq -r '.ok // 0' 2>/dev/null) || OK="0"
WARN=$(echo "$DOCTOR_OUTPUT" | jq -r '.warn // 0' 2>/dev/null) || WARN="0"
FAIL=$(echo "$DOCTOR_OUTPUT" | jq -r '.fail // 0' 2>/dev/null) || FAIL="0"

# Output health status
if [ "$HEALTHY" = "true" ]; then
  echo "✓ wasm4pm environment: HEALTHY ($OK ok, $WARN warn, 0 fail)"
else
  echo "✗ wasm4pm environment: DEGRADED ($OK ok, $WARN warn, $FAIL fail)"
  echo ""
  echo "Critical failures:"
  echo "$DOCTOR_OUTPUT" | jq -r '.checks[] | select(.status == "fail") | "  • \(.name): \(.message)\n    Fix: \(.fix)"'
fi

# Report checkpoint status if available
if [ -f "$CLAUDE_PROJECT_DIR/.wasm4pm/checkpoint" ]; then
  CHECKPOINT=$(cat "$CLAUDE_PROJECT_DIR/.wasm4pm/checkpoint" | jq -r '.progress | "\(.processed)/\(.total)"' 2>/dev/null)
  TIMESTAMP=$(cat "$CLAUDE_PROJECT_DIR/.wasm4pm/checkpoint" | jq -r '.timestamp' 2>/dev/null)
  if [ -n "$CHECKPOINT" ] && [ -n "$TIMESTAMP" ]; then
    echo "  Checkpoint: $CHECKPOINT traces processed (last: $TIMESTAMP)"
  fi
fi

exit 0
