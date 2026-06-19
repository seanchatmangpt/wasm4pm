#!/bin/bash
# SessionStart Hook: wasm4pm (wpm) Environment Briefing
#
# Runs `wpm doctor` and injects health summary into Claude's context.
# CRITICAL: Must succeed. Fails loudly if doctor is unavailable.

DOCTOR_OUTPUT=""

# Run wpm doctor via make target (builds CLI if needed).
# Separate stderr so build/runtime diagnostics don't contaminate the JSON parsed below.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || { echo "WARN: Cannot cd to project dir — skipping doctor" >&2; exit 0; }
DOCTOR_OUTPUT=$(make doctor 2>/tmp/wpm-doctor.err | awk '/^{/,/^}/ {print}') || {
  echo "WARN: make doctor failed — see /tmp/wpm-doctor.err for details" >&2
}

# If output is empty or doesn't carry the canonical envelope, try direct node execution.
if [ -z "$DOCTOR_OUTPUT" ]; then
  if [ -f "apps/wasm4pm/dist/bin/wpm.js" ]; then
    DOCTOR_OUTPUT=$(node apps/wasm4pm/dist/bin/wpm.js doctor check --format json 2>&1 | awk '/^{/,/^}/ {print}') || true
  fi
elif ! echo "$DOCTOR_OUTPUT" | jq -e '.payload.healthy' >/dev/null 2>&1; then
  if [ -f "apps/wasm4pm/dist/bin/wpm.js" ]; then
    DOCTOR_OUTPUT=$(node apps/wasm4pm/dist/bin/wpm.js doctor check --format json 2>&1 | awk '/^{/,/^}/ {print}') || true
  fi
fi

if [ -z "$DOCTOR_OUTPUT" ]; then
  echo "WARN: wpm doctor unavailable — run 'pnpm build' to enable environment health checks" >&2
  exit 0
fi

# Parse the report with jq (strict — must succeed).
# Canonical envelope: { command, status, exit_code, meta, payload: { healthy, summary, checks } }
HEALTHY=$(echo "$DOCTOR_OUTPUT" | jq -r '.payload.healthy' 2>/dev/null) || {
  echo "WARN: Cannot parse wpm doctor output — skipping health check" >&2
  exit 0
}

if [ -z "$HEALTHY" ] || [ "$HEALTHY" = "null" ]; then
  echo "WARN: Cannot parse wpm doctor output — skipping health check" >&2
  exit 0
fi

OK=$(echo "$DOCTOR_OUTPUT" | jq -r '.payload.summary.pass // 0' 2>/dev/null) || OK="0"
WARN=$(echo "$DOCTOR_OUTPUT" | jq -r '.payload.summary.warn // 0' 2>/dev/null) || WARN="0"
FAIL=$(echo "$DOCTOR_OUTPUT" | jq -r '.payload.summary.fail // 0' 2>/dev/null) || FAIL="0"
DEFECTS=$((WARN + FAIL))

# Output health status
if [ "$HEALTHY" = "true" ]; then
  echo "✓ wasm4pm environment: HEALTHY ($OK ok, 0 defects)"
else
  echo "✗ wasm4pm environment: DEGRADED ($OK ok, $DEFECTS defects)"
  echo ""
  echo "Defects requiring attention:"
  echo "$DOCTOR_OUTPUT" | jq -r '.payload.checks[] | select(.severity == "WARNING" or .severity == "STOP_THE_LINE") | "  • [\(.severity)] \(.name): \(.message)\n    Fix: \(.fix // "(no fix recorded)")"'
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
