#!/bin/bash
# SessionEnd Hook: wasm4pm Health Stamp
#
# Writes a session-end health record to .wasm4pm/sessions/<timestamp>.json
# containing: healthy status, defect count, git HEAD, and timestamp.
# Non-blocking (exit 0 always) — advisory record only.

set -e

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
SESSIONS_DIR=".wasm4pm/sessions"
mkdir -p "$SESSIONS_DIR"

# Run doctor to get final health status
DOCTOR_OUTPUT=""
DOCTOR_OUTPUT=$(make doctor 2>/dev/null | awk '/^{/,/^}/ {print}') || true
if [ -z "$DOCTOR_OUTPUT" ] && [ -f "apps/wasm4pm/dist/bin/wpm.js" ]; then
  DOCTOR_OUTPUT=$(node apps/wasm4pm/dist/bin/wpm.js doctor check --format json 2>&1 | awk '/^{/,/^}/ {print}') || true
fi

HEALTHY="unknown"
WARN=0
FAIL=0
if [ -n "$DOCTOR_OUTPUT" ]; then
  HEALTHY=$(echo "$DOCTOR_OUTPUT" | jq -r '.payload.healthy // "unknown"' 2>/dev/null) || HEALTHY="unknown"
  WARN=$(echo "$DOCTOR_OUTPUT" | jq -r '.payload.summary.warn // 0' 2>/dev/null) || WARN=0
  FAIL=$(echo "$DOCTOR_OUTPUT" | jq -r '.payload.summary.fail // 0' 2>/dev/null) || FAIL=0
fi
DEFECTS=$((WARN + FAIL))

GIT_HEAD=$(git rev-parse --short HEAD 2>/dev/null) || GIT_HEAD="unknown"
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || GIT_BRANCH="unknown"

RECORD=$(jq -n \
  --arg ts "$TIMESTAMP" \
  --arg healthy "$HEALTHY" \
  --argjson defects "$DEFECTS" \
  --arg git_head "$GIT_HEAD" \
  --arg git_branch "$GIT_BRANCH" \
  --arg project_dir "${CLAUDE_PROJECT_DIR:-.}" \
  '{
    session_end: $ts,
    healthy: ($healthy == "true"),
    defects: $defects,
    git_head: $git_head,
    git_branch: $git_branch,
    project_dir: $project_dir
  }')

echo "$RECORD" > "$SESSIONS_DIR/$(date -u +"%Y%m%dT%H%M%S").json"

if [ "$HEALTHY" = "true" ]; then
  echo "✓ Session ended: HEALTHY (0 defects) @ $GIT_BRANCH:$GIT_HEAD"
else
  echo "✗ Session ended: DEGRADED ($DEFECTS defects) @ $GIT_BRANCH:$GIT_HEAD"
fi

# Rotate evidence log — keep last 50000 lines
EVENTS_LOG="$CLAUDE_PROJECT_DIR/.claude/evidence/events.jsonl"
if [ -f "$EVENTS_LOG" ]; then
  line_count=$(wc -l < "$EVENTS_LOG")
  if [ "$line_count" -gt 50000 ]; then
    tail -n 50000 "$EVENTS_LOG" > "$EVENTS_LOG.tmp" && mv "$EVENTS_LOG.tmp" "$EVENTS_LOG"
  fi
fi

exit 0
