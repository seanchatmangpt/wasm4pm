#!/bin/bash
# TaskCreated Hook: Task Creation Evidence Logger
# Fires when a task is created via TaskCreate.
# Logs to the session evidence trail. Non-blocking.
# Returns {"decision":"block","reason":"..."} to prevent task creation if needed.

INPUT=$(cat)
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

SESSION_DIR=".wasm4pm/sessions"
mkdir -p "$SESSION_DIR" 2>/dev/null || true

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
GIT_HEAD=$(git rev-parse --short HEAD 2>/dev/null) || GIT_HEAD="unknown"

TASK_ID=$(echo "$INPUT" | jq -r '.task_id // ""' 2>/dev/null) || TASK_ID=""
TASK_DESC=$(echo "$INPUT" | jq -r '.description // ""' 2>/dev/null) || TASK_DESC=""
TASK_TYPE=$(echo "$INPUT" | jq -r '.task_type // ""' 2>/dev/null) || TASK_TYPE=""

RECORD=$(jq -n \
  --arg ts "$TIMESTAMP" \
  --arg task_id "$TASK_ID" \
  --arg description "$TASK_DESC" \
  --arg task_type "$TASK_TYPE" \
  --arg git_head "$GIT_HEAD" \
  '{
    timestamp: $ts,
    event: "task_created",
    task_id: $task_id,
    description: $description,
    task_type: $task_type,
    git_head: $git_head
  }')

echo "$RECORD" >> "$SESSION_DIR/tasks.jsonl" 2>/dev/null || true

exit 0
