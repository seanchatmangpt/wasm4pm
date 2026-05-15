#!/bin/bash
# PostCompact Hook: Context Integrity Check After Compaction
# Fires after compaction completes. Verifies environment is still healthy
# and logs compaction event with git state. Non-blocking.

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
CHECKPOINT_DIR=".wasm4pm/compaction-checkpoints"
mkdir -p "$CHECKPOINT_DIR" 2>/dev/null || true

GIT_HEAD=$(git rev-parse --short HEAD 2>/dev/null) || GIT_HEAD="unknown"
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || GIT_BRANCH="unknown"
GIT_STATUS=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ') || GIT_STATUS="unknown"

# Quick health snapshot (non-blocking — skip if CLI not built)
HEALTHY="unknown"
if [ -f "apps/wasm4pm/dist/bin/wpm.js" ]; then
  RESULT=$(node apps/wasm4pm/dist/bin/wpm.js doctor check --format json 2>/dev/null \
    | awk '/^\{/,0') || true
  if [ -n "$RESULT" ]; then
    HEALTHY=$(echo "$RESULT" | jq -r '.payload.healthy // "unknown"' 2>/dev/null) || true
  fi
fi

RECORD=$(jq -n \
  --arg ts "$TIMESTAMP" \
  --arg git_head "$GIT_HEAD" \
  --arg git_branch "$GIT_BRANCH" \
  --arg git_status "$GIT_STATUS" \
  --arg healthy "$HEALTHY" \
  '{
    event: "post_compact",
    timestamp: $ts,
    git_head: $git_head,
    git_branch: $git_branch,
    uncommitted_files: ($git_status | tonumber? // 0),
    healthy: ($healthy == "true")
  }')

CHECKPOINT_FILE="$CHECKPOINT_DIR/post-$(echo "$TIMESTAMP" | tr ':' '-').json"
echo "$RECORD" > "$CHECKPOINT_FILE" 2>/dev/null || true

if [ "$HEALTHY" = "true" ]; then
  echo "✓ Post-compaction: HEALTHY @ $GIT_BRANCH:$GIT_HEAD ($GIT_STATUS uncommitted)"
else
  echo "⚠ Post-compaction: health=$HEALTHY @ $GIT_BRANCH:$GIT_HEAD"
fi

exit 0
