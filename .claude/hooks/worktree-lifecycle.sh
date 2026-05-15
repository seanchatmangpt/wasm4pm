#!/bin/bash
# WorktreeCreate / WorktreeRemove Hook: Worktree Lifecycle Audit
# Fires when agent worktrees are created or removed.
# Logs lifecycle events for agent isolation audit trail. Non-blocking.

INPUT=$(cat)
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

AUDIT_DIR=".wasm4pm/audit"
mkdir -p "$AUDIT_DIR" 2>/dev/null || true

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
GIT_HEAD=$(git rev-parse --short HEAD 2>/dev/null) || GIT_HEAD="unknown"

# Detect event type from input
EVENT=$(echo "$INPUT" | jq -r '.event_type // ""' 2>/dev/null) || EVENT=""
WORKTREE_PATH=$(echo "$INPUT" | jq -r '.worktree_path // ""' 2>/dev/null) || WORKTREE_PATH=""
BRANCH=$(echo "$INPUT" | jq -r '.branch // ""' 2>/dev/null) || BRANCH=""
AGENT_ID=$(echo "$INPUT" | jq -r '.agent_id // ""' 2>/dev/null) || AGENT_ID=""

# Infer event from script name if not in input
SCRIPT_NAME=$(basename "$0")
if [ -z "$EVENT" ]; then
  case "$SCRIPT_NAME" in
    *create*) EVENT="worktree_create" ;;
    *remove*) EVENT="worktree_remove" ;;
    *) EVENT="worktree_lifecycle" ;;
  esac
fi

RECORD=$(jq -n \
  --arg ts "$TIMESTAMP" \
  --arg event "$EVENT" \
  --arg worktree_path "$WORKTREE_PATH" \
  --arg branch "$BRANCH" \
  --arg agent_id "$AGENT_ID" \
  --arg git_head "$GIT_HEAD" \
  '{
    timestamp: $ts,
    event: $event,
    worktree_path: $worktree_path,
    branch: $branch,
    agent_id: $agent_id,
    git_head: $git_head
  }')

echo "$RECORD" >> "$AUDIT_DIR/worktree-lifecycle.jsonl" 2>/dev/null || true
echo "Worktree $EVENT: ${WORKTREE_PATH:-unknown} (${BRANCH:-unknown branch})"

exit 0
