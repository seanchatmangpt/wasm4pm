#!/bin/bash
# Stop Hook: Session Delta Metrics Display
# At session end, compares current health to previous snapshot and shows delta.
# Advisory only (exit 0 always). Complements metrics-track.sh.

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

METRICS_FILE=".wasm4pm/metrics.json"
METRICS_LOG=".wasm4pm/metrics-history.jsonl"

command -v jq &>/dev/null || exit 0

[ -f "$METRICS_LOG" ] || exit 0

# Get line count to determine if we have a previous snapshot
LINE_COUNT=$(wc -l < "$METRICS_LOG" 2>/dev/null | tr -d ' ') || exit 0
[ "$LINE_COUNT" -lt 2 ] && exit 0

# Get last two snapshots for delta comparison
PREV=$(tail -n 2 "$METRICS_LOG" | head -n 1)
CURR=$(tail -n 1 "$METRICS_LOG")

[ -z "$PREV" ] || [ -z "$CURR" ] && exit 0

# Extract values
prev_rust=$(echo "$PREV" | jq -r '.compiler_warnings.rust // 0' 2>/dev/null) || prev_rust=0
curr_rust=$(echo "$CURR" | jq -r '.compiler_warnings.rust // 0' 2>/dev/null) || curr_rust=0
prev_ts=$(echo "$PREV" | jq -r '.compiler_warnings.typescript // 0' 2>/dev/null) || prev_ts=0
curr_ts=$(echo "$CURR" | jq -r '.compiler_warnings.typescript // 0' 2>/dev/null) || curr_ts=0
prev_pass=$(echo "$PREV" | jq -r '.doctor.pass // 0' 2>/dev/null) || prev_pass=0
curr_pass=$(echo "$CURR" | jq -r '.doctor.pass // 0' 2>/dev/null) || curr_pass=0
prev_fail=$(echo "$PREV" | jq -r '(.doctor.warn + .doctor.fail) // 0' 2>/dev/null) || prev_fail=0
curr_fail=$(echo "$CURR" | jq -r '(.doctor.warn + .doctor.fail) // 0' 2>/dev/null) || curr_fail=0
curr_branch=$(echo "$CURR" | jq -r '.git_branch // "unknown"' 2>/dev/null) || curr_branch="unknown"
curr_head=$(echo "$CURR" | jq -r '.git_head // "unknown"' 2>/dev/null) || curr_head="unknown"

# Compute deltas
rust_delta=$(( curr_rust - prev_rust ))
ts_delta=$(( curr_ts - prev_ts ))
pass_delta=$(( curr_pass - prev_pass ))
fail_delta=$(( curr_fail - prev_fail ))

echo ""
echo "Session Delta @ $curr_branch:$curr_head"
echo "─────────────────────────────────────"

# Doctor checks delta
if [ "$fail_delta" -lt 0 ]; then
  echo "✓ Doctor defects: $prev_fail → $curr_fail (${fail_delta} fixed)"
elif [ "$fail_delta" -gt 0 ]; then
  echo "⚠ Doctor defects: $prev_fail → $curr_fail (+${fail_delta} introduced)"
else
  echo "  Doctor defects: $curr_fail (no change)"
fi

# Rust warnings delta
if [ "$rust_delta" -lt 0 ]; then
  echo "✓ Rust warnings: $prev_rust → $curr_rust (${rust_delta} cleared)"
elif [ "$rust_delta" -gt 0 ]; then
  echo "⚠ Rust warnings: $prev_rust → $curr_rust (+${rust_delta} introduced)"
else
  echo "  Rust warnings: $curr_rust (no change)"
fi

# TypeScript errors delta
if [ "$ts_delta" -lt 0 ]; then
  echo "✓ TS errors: $prev_ts → $curr_ts (${ts_delta} cleared)"
elif [ "$ts_delta" -gt 0 ]; then
  echo "⚠ TS errors: $prev_ts → $curr_ts (+${ts_delta} introduced)"
else
  echo "  TS errors: $curr_ts (no change)"
fi

echo ""
exit 0
