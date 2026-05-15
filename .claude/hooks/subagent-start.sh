#!/bin/bash
# SubagentStart Hook: Subagent Lifecycle Tracker
# Fires when a subagent starts (command-type only per Claude Code constraints).
# Logs to session evidence trail for complete agent lifecycle coverage.

INPUT=$(cat)
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

SESSION_DIR=".wasm4pm/sessions"
mkdir -p "$SESSION_DIR" 2>/dev/null || true

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
GIT_HEAD=$(git rev-parse --short HEAD 2>/dev/null) || GIT_HEAD="unknown"

AGENT_ID=$(echo "$INPUT" | jq -r '.agent_id // ""' 2>/dev/null) || AGENT_ID=""
AGENT_TYPE=$(echo "$INPUT" | jq -r '.agent_type // ""' 2>/dev/null) || AGENT_TYPE=""
TASK_DESC=$(echo "$INPUT" | jq -r '.task_description // ""' 2>/dev/null) || TASK_DESC=""

RECORD=$(jq -n \
  --arg ts "$TIMESTAMP" \
  --arg agent_id "$AGENT_ID" \
  --arg agent_type "$AGENT_TYPE" \
  --arg task "$TASK_DESC" \
  --arg git_head "$GIT_HEAD" \
  '{
    timestamp: $ts,
    event: "subagent_start",
    agent_id: $agent_id,
    agent_type: $agent_type,
    task: $task,
    git_head: $git_head
  }')

echo "$RECORD" >> "$SESSION_DIR/subagents.jsonl" 2>/dev/null || true

exit 0
