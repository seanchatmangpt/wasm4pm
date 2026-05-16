#!/bin/bash
# TeammateIdle Hook: Multi-Agent Idle Detector
# Fires when a teammate agent becomes idle in multi-agent workflows.
# Logs idle events for agent coordination audit. Non-blocking.

INPUT=$(cat)
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

SESSION_DIR=".wasm4pm/sessions"
mkdir -p "$SESSION_DIR" 2>/dev/null || true

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
AGENT_ID=$(echo "$INPUT" | jq -r '.agent_id // ""' 2>/dev/null) || AGENT_ID=""
IDLE_REASON=$(echo "$INPUT" | jq -r '.idle_reason // ""' 2>/dev/null) || IDLE_REASON=""
GIT_HEAD=$(git rev-parse --short HEAD 2>/dev/null) || GIT_HEAD="unknown"

jq -n \
  --arg ts "$TIMESTAMP" \
  --arg agent_id "$AGENT_ID" \
  --arg reason "$IDLE_REASON" \
  --arg git_head "$GIT_HEAD" \
  '{timestamp: $ts, event: "teammate_idle", agent_id: $agent_id, reason: $reason, git_head: $git_head}' \
  >> "$SESSION_DIR/teammates.jsonl" 2>/dev/null || true

exit 0
