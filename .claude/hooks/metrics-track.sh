#!/bin/bash
# Stop Hook: Kaizen Metrics Snapshot
# At session end, records health metrics from wpm doctor into .wasm4pm/metrics.json
# Provides continuous improvement tracking across sessions. Non-blocking.

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
METRICS_FILE=".wasm4pm/metrics.json"
METRICS_LOG=".wasm4pm/metrics-history.jsonl"
mkdir -p "$(dirname "$METRICS_FILE")"

GIT_HEAD=$(git rev-parse --short HEAD 2>/dev/null) || GIT_HEAD="unknown"
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || GIT_BRANCH="unknown"

# Collect health from doctor
DOCTOR_OUTPUT=""
if [ -f "apps/wasm4pm/dist/bin/wpm.js" ]; then
  DOCTOR_OUTPUT=$(node apps/wasm4pm/dist/bin/wpm.js doctor check --format json 2>/dev/null \
    | awk '/^\{/,0') || true
fi

HEALTHY="unknown"
PASS=0
WARN=0
FAIL=0
if [ -n "$DOCTOR_OUTPUT" ]; then
  HEALTHY=$(echo "$DOCTOR_OUTPUT" | jq -r '.payload.healthy // "unknown"' 2>/dev/null) || true
  PASS=$(echo "$DOCTOR_OUTPUT" | jq -r '.payload.summary.pass // 0' 2>/dev/null) || PASS=0
  WARN=$(echo "$DOCTOR_OUTPUT" | jq -r '.payload.summary.warn // 0' 2>/dev/null) || WARN=0
  FAIL=$(echo "$DOCTOR_OUTPUT" | jq -r '.payload.summary.fail // 0' 2>/dev/null) || FAIL=0
fi

# Collect Rust compiler warnings from last build (non-blocking)
RUST_WARNINGS=$(cargo check --manifest-path wasm4pm/Cargo.toml 2>&1 | grep -c "^warning" 2>/dev/null) || RUST_WARNINGS=0

# Count TS errors from pnpm lint output (non-blocking)
LINT_ERRORS=$(pnpm lint 2>&1 | grep -c "error TS" 2>/dev/null) || LINT_ERRORS=0

SNAPSHOT=$(jq -n \
  --arg ts "$TIMESTAMP" \
  --arg git_head "$GIT_HEAD" \
  --arg git_branch "$GIT_BRANCH" \
  --arg healthy "$HEALTHY" \
  --argjson pass "$PASS" \
  --argjson warn "$WARN" \
  --argjson fail "$FAIL" \
  --argjson rust_warnings "$RUST_WARNINGS" \
  --argjson lint_errors "$LINT_ERRORS" \
  '{
    timestamp: $ts,
    git_head: $git_head,
    git_branch: $git_branch,
    healthy: ($healthy == "true"),
    doctor: {pass: $pass, warn: $warn, fail: $fail},
    compiler_warnings: {rust: $rust_warnings, typescript: $lint_errors}
  }')

# Append to history log
echo "$SNAPSHOT" >> "$METRICS_LOG" 2>/dev/null || true

# Update latest snapshot in metrics.json (merge into existing structure)
if [ -f "$METRICS_FILE" ]; then
  TMP=$(mktemp)
  jq --argjson snap "$SNAPSHOT" '.latest_snapshot = $snap' "$METRICS_FILE" > "$TMP" 2>/dev/null && mv "$TMP" "$METRICS_FILE" || rm -f "$TMP"
fi

DEFECTS=$((WARN + FAIL))
if [ "$HEALTHY" = "true" ]; then
  echo "✓ Metrics snapshot: HEALTHY ($PASS ok, 0 defects) @ $GIT_BRANCH:$GIT_HEAD"
else
  echo "✗ Metrics snapshot: DEGRADED ($PASS ok, $DEFECTS defects) @ $GIT_BRANCH:$GIT_HEAD"
fi

exit 0
