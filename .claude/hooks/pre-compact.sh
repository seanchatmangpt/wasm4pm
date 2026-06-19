#!/bin/bash
# PreCompact Hook: State checkpoint before context compaction
#
# Writes git status + doctor health snapshot to .wasm4pm/compaction-checkpoints/
# so we can reconstruct "what was the state when compaction happened."
# Non-blocking (exit 0 always).

set -e

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
CHECKPOINT_DIR=".wasm4pm/compaction-checkpoints"
mkdir -p "$CHECKPOINT_DIR" 2>/dev/null || true

GIT_HEAD=$(git rev-parse --short HEAD 2>/dev/null) || GIT_HEAD="unknown"
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || GIT_BRANCH="unknown"
GIT_STATUS=$(git status --short 2>/dev/null | head -20 | tr '\n' '|') || GIT_STATUS=""

# Quick health check via node (faster than make doctor)
HEALTHY="unknown"
DEFECTS=0
if [ -f "apps/wasm4pm/dist/bin/wpm.js" ]; then
  DOCTOR_OUTPUT=$(node apps/wasm4pm/dist/bin/wpm.js doctor check --format json 2>/dev/null \
    | awk '/^{/,/^}/ {print}') || true
  if [ -n "$DOCTOR_OUTPUT" ]; then
    HEALTHY=$(echo "$DOCTOR_OUTPUT" | jq -r '.payload.healthy // "unknown"' 2>/dev/null) || HEALTHY="unknown"
    WARN=$(echo "$DOCTOR_OUTPUT" | jq -r '.payload.summary.warn // 0' 2>/dev/null) || WARN=0
    FAIL=$(echo "$DOCTOR_OUTPUT" | jq -r '.payload.summary.fail // 0' 2>/dev/null) || FAIL=0
    DEFECTS=$((WARN + FAIL))
  fi
fi

# Derive HEALTHY from defect count if jq boolean extraction failed
if [ "$HEALTHY" = "unknown" ]; then
  [ "$DEFECTS" -eq 0 ] && HEALTHY="true" || HEALTHY="false"
fi

CHECKPOINT=$(jq -n \
  --arg ts "$TIMESTAMP" \
  --arg git_head "$GIT_HEAD" \
  --arg git_branch "$GIT_BRANCH" \
  --arg git_status "$GIT_STATUS" \
  --arg healthy "$HEALTHY" \
  --argjson defects "$DEFECTS" \
  '{
    compacted_at: $ts,
    git_head: $git_head,
    git_branch: $git_branch,
    git_status_snapshot: $git_status,
    healthy: ($healthy == "true"),
    defects: $defects
  }')

FILE="$CHECKPOINT_DIR/$(date -u +"%Y%m%dT%H%M%S").json"
echo "$CHECKPOINT" > "$FILE"

echo "Compaction checkpoint: $GIT_BRANCH@$GIT_HEAD (healthy: $HEALTHY, defects: $DEFECTS)"
exit 0
